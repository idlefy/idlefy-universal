import type { ValuesPath } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { classify, resolve, type SchemaNode, type Widget } from './schema';
import { isObj } from '../model/guards';
import { REF_FIXUPS, intOrStringStarter, stringStarter } from './starters';

export type Field = {
  key: string; path: ValuesPath; label: string; description?: string;
  widget: Widget; schema: SchemaNode; value: unknown; present: boolean; required: boolean;
  /** This key must not be removed: schema-required, chart-required (`chartRequired`), or the only
   *  member left of a `oneOf`/`anyOf` "exactly one of" group. Widgets hide their clear control; the
   *  edit-integrity test reads it to know the delete op is unreachable. */
  locked: boolean;
  tier: Tier;
};

/**
 * Values paths the chart's own templates require although `values.schema.json` does not — clearing
 * one fails the render. `*` matches exactly one path segment (including a numeric list index, since
 * `chartRequired` stringifies every segment before comparing). Matching by path shape rather than by
 * `$defs` name is deliberate: `IngressConfig`/`HttpRouteConfig` are used both standalone (`ingresses.*.hosts`)
 * and as a workload's auto-created block (`*.*.ingress.hosts`) — the two need separate entries because
 * clearing `hosts` fails standalone with "configuration must not be empty" and fails the workload case
 * with `autoCreateCertificate requires ingress configuration` once `ingress` is left as `{}`. Each
 * entry is the `fail` (or nil-pointer template crash) it prevents, quoted from the engine.
 */
const CHART_REQUIRED_PATHS: readonly string[] = [
  'ingresses.*.hosts',                     // Ingress <n>: configuration must not be empty
  'httpRoutes.*.hostnames',                // HTTPRoute <n>: hostnames is required
  'httpRoutes.*.parentRefs',               // HTTPRoute <n>: parentRefs must be specified either per-route or in generic.httpRoutesGeneral
  'httpRoutes.*.rules',                    // HTTPRoute <n>: at least one rule is required
  'httpRoutes.*.rules.*.matches',          // HTTPRoute <n>: rule[i] must have at least one match
  'httpRoutes.*.rules.*.matches.*.path',   // httproute.yaml:26 <$match.path.type>: nil pointer evaluating interface {}.type
  'hpas.*.metrics.*.resource',             // HpaMetric's `if type==Resource then required:[resource]` — resolve() drops if/then allOf members, so `required` never sees it
  '*.*.hpa.metrics.*.resource',            // the same $defs as an auto-created HPA block
  '*.*.httpRoute.hostnames',               // autoCreateHttpRoute for <n> requires explicit httpRoute.hostnames or generic.ingressesGeneral.domain
  '*.*.httpRoute.rules.*.matches.*.path',  // same nil deref, on the auto-created route
  '*.*.ingress.hosts',                     // autoCreateCertificate requires ingress configuration (clearing hosts leaves `ingress: {}`)
  '*.*.containers.*.ports',                // <Kind> <n>: autoCreateService=true requires at least one container port
  '*.*.networkPolicy.ingress',             // <Kind> <n>: policyTypes contains 'Ingress' but 'networkPolicy.ingress' is not defined (use [] for explicit deny)
];

/** True for a values path `CHART_REQUIRED_PATHS` matches. */
export function chartRequired(path: ValuesPath): boolean {
  const segs = path.map(String);
  return CHART_REQUIRED_PATHS.some((p) => {
    const pat = p.split('.');
    return pat.length === segs.length && pat.every((x, i) => x === '*' || x === segs[i]);
  });
}

/**
 * Top-level keys a `oneOf`/`anyOf` of single-`required` alternatives declares mutually exclusive:
 * `PdbConfig` (minAvailable xor maxUnavailable), `EnvVar` (value xor valueFrom), `IngressHost` and
 * `HttpRouteHostname` (host xor subdomain). `IngressHost` writes it as `anyOf` + `not` and includes
 * a "neither" alternative with no `required` at all, so alternatives without a single `required`
 * key are skipped rather than disqualifying the group. Fewer than two keys means no group.
 */
export function exclusiveKeys(root: SchemaNode, node: SchemaNode): string[] {
  const r = resolve(root, node);
  const alts: SchemaNode[] = Array.isArray(r.oneOf) ? r.oneOf : Array.isArray(r.anyOf) ? r.anyOf : [];
  const props = isObj(r.properties) ? (r.properties as Record<string, unknown>) : {};
  const out: string[] = [];
  for (const a of alts) {
    if (!isObj(a) || !Array.isArray(a.required) || a.required.length !== 1) continue;
    const k = String(a.required[0]);
    if (k in props && !out.includes(k)) out.push(k);
  }
  return out.length >= 2 ? out : [];
}

/** One `Field`, resolved and classified from `node`. The single constructor `buildFields` and every
 *  hand-built field (a release-level bare widget, a `MapOfListsField` card) share. */
export function makeField(root: SchemaNode, key: string, path: ValuesPath, node: SchemaNode, value: unknown, opts: { tier?: Tier; present?: boolean; required?: boolean; locked?: boolean } = {}): Field {
  const s = resolve(root, node);
  return {
    key, path, label: key, description: typeof s.description === 'string' ? s.description.trim() : undefined,
    widget: classify(root, node), schema: s, value, present: opts.present ?? value !== undefined, required: opts.required ?? false,
    locked: opts.locked ?? opts.required ?? false,
    tier: opts.tier ?? (s['x-ui-tier'] === 'basic' ? 'basic' : 'advanced'),
  };
}

export function buildFields(root: SchemaNode, node: SchemaNode, basePath: ValuesPath, value: unknown, tier: Tier, opts: { hide?: (key: string) => boolean } = {}): Field[] {
  const r = resolve(root, node);
  const props: Record<string, SchemaNode> = isObj(r.properties) ? (r.properties as any) : {};
  const required = new Set<string>(r.required ?? []);
  const v = isObj(value) ? value : {};
  const excl = exclusiveKeys(root, r);
  const has = (k: string) => Object.prototype.hasOwnProperty.call(v, k);
  const siblingSet = (key: string) => excl.some((k) => k !== key && has(k));
  const out: Field[] = [];
  for (const [key, raw] of Object.entries(props)) {
    if (opts.hide?.(key)) continue;
    const present = has(key);
    // Adding the other half of an "exactly one of" group makes the object match two branches
    // (PdbConfig, EnvVar), so it is not offered while a sibling is set — and the sibling that *is*
    // set is the only one left, so it must not be cleared either.
    if (!present && excl.includes(key) && siblingSet(key)) continue;
    const path = [...basePath, key];
    const locked = required.has(key) || chartRequired(path) || (present && excl.includes(key) && !siblingSet(key));
    const field = makeField(root, key, path, raw, v[key], { present, required: required.has(key), locked });
    if (tier === 'basic' && field.tier !== 'basic' && !field.required && !field.present) continue;
    out.push(field);
  }
  return out;
}

/** One rule for "is this text a valid `widget`-typed scalar", shared by every field that parses typed
 *  text back into a value. `undefined` means the text does not parse — the caller must not emit an edit.
 *  `nonNegative` narrows an integer widget to digits only (no leading `-`), for PortsTable's port numbers. */
export function parseScalarText(text: string, widget: Widget, opts: { nonNegative?: boolean } = {}): number | string | undefined {
  if (widget.kind === 'number') {
    const re = widget.integer ? (opts.nonNegative ? /^\d+$/ : /^-?\d+$/) : /^-?\d+(\.\d+)?$/;
    return re.test(text) ? Number(text) : undefined;
  }
  if (widget.kind === 'string' && widget.intOrString && /^-?\d+$/.test(text)) return Number(text);
  return text;
}

/** Deep-clones a schema-derived value (an `examples`/`default` entry) so callers never hold a live
 *  reference into the imported schema module — two "add" actions must not share one object. */
const clone = <T>(v: T): T => structuredClone(v);

/**
 * A value that satisfies the node well enough to render. Precedence: `default` (when present), else the
 * first `examples` entry when it fits the node's own properties, else a type-appropriate empty value.
 * Some docs examples describe the *map entry* that holds the node (PortSpec.examples[0] is
 * `{http: {containerPort: …}}`), so a single-key example whose inner object fits the properties is
 * unwrapped. Every example/default-derived value is deep-cloned before returning, then run through
 * `REF_FIXUPS` — the chart rejects some of its own schema examples, and every insertion point (the
 * palette, an "Add" chip, an object-list "add item") must get the correction, not just the palette.
 */
export function starterValue(root: SchemaNode, node: SchemaNode): unknown {
  const r = resolve(root, node);
  return fixup(root, r, derive(root, r));
}

/** Applies `REF_FIXUPS` to a starter: to the value itself, or to each element of an array whose
 *  `items` name a fixed-up `$defs` (the `hosts`/`hostnames` chip inserts examples[0] of the array). */
function fixup(root: SchemaNode, r: SchemaNode, value: unknown): unknown {
  const own = REF_FIXUPS[String(r['x-ref-name'])];
  if (own && isObj(value)) { own(value as Record<string, any>); return value; }
  if (Array.isArray(value) && isObj(r.items)) {
    const perItem = REF_FIXUPS[String(resolve(root, r.items as SchemaNode)['x-ref-name'])];
    if (perItem) for (const el of value) if (isObj(el)) perItem(el as Record<string, any>);
  }
  return value;
}

function derive(root: SchemaNode, r: SchemaNode): unknown {
  if (r.default !== undefined) return clone(r.default);
  const props = isObj(r.properties) ? (r.properties as Record<string, unknown>) : undefined;
  const fits = (ex: unknown) => !props || r.additionalProperties !== false || (isObj(ex) && Object.keys(ex).every((k) => k in props));
  if (Array.isArray(r.examples) && r.examples.length) {
    const ex = r.examples[0];
    if (fits(ex)) return clone(ex);
    if (isObj(ex) && Object.keys(ex).length === 1) { const inner = Object.values(ex)[0]; if (fits(inner)) return clone(inner); }
  }
  if (r.enum?.length) return r.enum[0];
  const t = Array.isArray(r.type) ? r.type[0] : r.type;
  switch (t) {
    case 'boolean': return false;
    case 'integer': case 'number': return typeof r.minimum === 'number' ? r.minimum : 0;
    // '' is not a legal value for a pattern- or minLength-constrained string, and the schema gives no
    // example for any of those nodes — stringStarter() answers those from src/inspector/starters.ts.
    case 'string': return stringStarter(root, r);
    case 'array': return [];
  }
  if (t === 'object' || isObj(r.properties)) {
    const o: Record<string, unknown> = {};
    for (const k of r.required ?? []) if (isObj(r.properties?.[k])) o[k] = starterValue(root, r.properties[k]);
    return o;
  }
  // No direct `type` — e.g. a bare `oneOf`/`anyOf` IntOrString node (PdbConfig.minAvailable,
  // ServicePort.targetPort). Reuse classify()'s own oneOf/anyOf collapse instead of re-deriving it here.
  const widget = classify(root, r);
  switch (widget.kind) {
    case 'boolean': return false;
    case 'number': return 0;
    case 'string': return widget.intOrString ? intOrStringStarter(r) : '';
    case 'list': return [];
    default: return {};
  }
}

export type ItemShape = { identifying: string | null; leaves: string[][]; extras: string[]; required: string[]; pair: boolean; exclusive: string[] };
const ID_KEYS = ['name', 'host', 'key', 'mountPath', 'path', 'ip', 'type', 'secretName'];
const kindOf = (root: SchemaNode, node: SchemaNode) => classify(root, node).kind;
const isTextLeaf = (root: SchemaNode, node: SchemaNode) => { const k = kindOf(root, node); return k === 'string' || k === 'number'; };
const isLeafWidget = (root: SchemaNode, node: SchemaNode) => isTextLeaf(root, node) || kindOf(root, node) === 'boolean';
// inside a promoted nested object, identifying-style keys come first (`secretKeyRef.name / secretKeyRef.key`), then schema order
const byIdKeys = (a: string, b: string) => (ID_KEYS.indexOf(a) + 1 || 99) - (ID_KEYS.indexOf(b) + 1 || 99);

/**
 * How one item of an object list renders, decided by the item schema alone.
 * Leaves: string/number properties, plus the string/number properties of a nested object whose properties
 * are all scalar (`secretKeyRef.name`, `secretKeyRef.key`). Everything else (lists, booleans, deeper
 * objects) is an "extra" reachable through the row's expander; a promoted nested object that also has a
 * boolean (`secretKeyRef.optional`) is both. Pair row = an identifying leaf plus one or two other leaves.
 * `required` lists the item's required top-level keys so an emptied required leaf is set to '' rather than deleted.
 * `exclusive` is `exclusiveKeys(root, item)`: the top-level keys a `oneOf`/`anyOf` of single
 * `required` alternatives makes mutually exclusive (HttpRouteHostname and IngressHost: `host` xor
 * `subdomain`; EnvVar: `value` xor `valueFrom`, where `valueFrom` is an extra, not a leaf) —
 * setting one must delete the others.
 */
export function itemShape(root: SchemaNode, item: SchemaNode): ItemShape {
  const r = resolve(root, item);
  const props: Record<string, SchemaNode> = isObj(r.properties) ? (r.properties as any) : {};
  const leaves: string[][] = [];
  const extras: string[] = [];
  for (const [k, raw] of Object.entries(props)) {
    const s = resolve(root, raw);
    if (isTextLeaf(root, s)) { leaves.push([k]); continue; }
    const sub: Record<string, SchemaNode> = isObj(s.properties) ? (s.properties as any) : {};
    const subKeys = Object.keys(sub);
    if (kindOf(root, s) === 'object' && subKeys.length > 0 && subKeys.every((sk) => isLeafWidget(root, resolve(root, sub[sk])))) {
      const text = subKeys.filter((sk) => isTextLeaf(root, resolve(root, sub[sk]))).sort(byIdKeys);
      for (const sk of text) leaves.push([k, sk]);
      if (text.length < subKeys.length) extras.push(k);
      continue;
    }
    extras.push(k);
  }
  const identifying = ID_KEYS.find((k) => leaves.some((l) => l.length === 1 && l[0] === k)) ?? null;
  const rest = leaves.filter((l) => !(l.length === 1 && l[0] === identifying));
  const exclusive = exclusiveKeys(root, r);
  return { identifying, leaves: rest, extras, required: Array.isArray(r.required) ? r.required.map(String) : [], pair: identifying !== null && rest.length >= 1 && rest.length <= 2, exclusive };
}

const ITEM_LABELS: Record<string, string> = {
  secretRefs: 'Variable', env: 'Variable', envFrom: 'Source', hosts: 'Host', paths: 'Path', tls: 'TLS entry', tolerations: 'Toleration',
  hostAliases: 'Host alias', volumeMounts: 'Mount', metrics: 'Metric', endpoints: 'Endpoint', rules: 'Rule', parentRefs: 'Parent', options: 'Option',
};
/** Chip text for adding one item to a list keyed `key`. */
export const itemLabelOf = (key: string): string => ITEM_LABELS[key] ?? 'Item';

const SENTENCE_ABBREVIATIONS = new Set(['e.g', 'i.e', 'etc', 'vs', 'ex', 'cf']);

/**
 * First sentence of a schema description. A `.`/`!`/`?` ends the sentence only when it is followed by
 * whitespace then an uppercase letter or digit (or by end of text), and the token immediately before it
 * is not a known abbreviation (`e.g`, `i.e`, `etc`, `vs`, `ex`, `cf`) or a single letter (as in the `e`
 * and `g` of `e.g.`) — otherwise that punctuation is inside the sentence, not the end of it. Falls back
 * to the whole first line when no terminator qualifies.
 */
export function firstSentence(desc: string | undefined): string | undefined {
  const t = desc?.trim();
  if (!t) return undefined;
  const re = /[.!?]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const idx = m.index;
    const after = t.slice(idx + 1);
    if (!/^\s+[A-Z0-9]/.test(after) && after.trim() !== '') continue; // not followed by a new sentence, and not the end of text
    const word = t.slice(0, idx).match(/[A-Za-z0-9.]+$/)?.[0].toLowerCase();
    if (word && (SENTENCE_ABBREVIATIONS.has(word) || /^[a-z]$/.test(word))) continue; // abbreviation like "e.g." / "i.e."
    return t.slice(0, idx + 1).trim();
  }
  return t.split('\n')[0].trim() || undefined;
}

/** Value written when the user adds an absent field from a chip: a boolean chip means "turn it on". */
export function chipValue(root: SchemaNode, field: Field): unknown {
  if (field.widget.kind === 'boolean') return true;
  return starterValue(root, field.schema);
}

const ACRONYMS: Record<string, string> = {
  hpa: 'HPA', pdb: 'PDB', rbac: 'RBAC', dns: 'DNS', tls: 'TLS', url: 'URL', cpu: 'CPU', ttl: 'TTL', ip: 'IP', ipc: 'IPC', pid: 'PID',
  pvc: 'PVC', http: 'HTTP', https: 'HTTPS', grpc: 'gRPC', api: 'API', id: 'ID', uid: 'UID', gid: 'GID',
};

/** A values key as a person reads it: `serviceAccountName` → "Service account name", `hostIPC` → "Host IPC". */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  return words
    .map((w, i) => {
      const lw = w.toLowerCase();
      if (ACRONYMS[lw]) return ACRONYMS[lw];
      return i === 0 ? lw[0].toUpperCase() + lw.slice(1) : lw;
    })
    .join(' ');
}
