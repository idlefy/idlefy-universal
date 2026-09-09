import type { ValuesPath } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { classify, resolve, type SchemaNode, type Widget } from './schema';

export type Field = {
  key: string; path: ValuesPath; label: string; description?: string;
  widget: Widget; schema: SchemaNode; value: unknown; present: boolean; required: boolean; tier: Tier;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function buildFields(root: SchemaNode, node: SchemaNode, basePath: ValuesPath, value: unknown, tier: Tier, opts: { hide?: (key: string) => boolean } = {}): Field[] {
  const r = resolve(root, node);
  const props: Record<string, SchemaNode> = isObj(r.properties) ? (r.properties as any) : {};
  const required = new Set<string>(r.required ?? []);
  const v = isObj(value) ? value : {};
  const out: Field[] = [];
  for (const [key, raw] of Object.entries(props)) {
    if (opts.hide?.(key)) continue;
    const s = resolve(root, raw);
    const fieldTier: Tier = s['x-ui-tier'] === 'basic' ? 'basic' : 'advanced';
    const present = Object.prototype.hasOwnProperty.call(v, key);
    if (tier === 'basic' && fieldTier !== 'basic' && !required.has(key) && !present) continue;
    out.push({
      key, path: [...basePath, key], label: key, description: typeof s.description === 'string' ? s.description.trim() : undefined,
      widget: classify(root, raw), schema: s, value: v[key], present, required: required.has(key), tier: fieldTier,
    });
  }
  return out;
}

/** Deep-clones a schema-derived value (an `examples`/`default` entry) so callers never hold a live
 *  reference into the imported schema module — two "add" actions must not share one object. */
const clone = <T>(v: T): T => structuredClone(v);

/**
 * A value that satisfies the node well enough to render. Precedence: `default` (when present), else the
 * first `examples` entry when it fits the node's own properties, else a type-appropriate empty value.
 * Some docs examples describe the *map entry* that holds the node (PortSpec.examples[0] is
 * `{http: {containerPort: …}}`), so a single-key example whose inner object fits the properties is
 * unwrapped. Every example/default-derived value is deep-cloned before returning.
 */
export function starterValue(root: SchemaNode, node: SchemaNode): unknown {
  const r = resolve(root, node);
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
    case 'string': return '';
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
    case 'string': return '';
    case 'list': return [];
    default: return {};
  }
}

export type ItemShape = { identifying: string | null; leaves: string[][]; extras: string[]; required: string[]; pair: boolean };
const ID_KEYS = ['name', 'host', 'key', 'mountPath', 'path', 'ip', 'type', 'secretName'];
const kindOf = (root: SchemaNode, node: SchemaNode) => classify(root, node).kind;
const isTextLeaf = (root: SchemaNode, node: SchemaNode) => { const k = kindOf(root, node); return k === 'string' || k === 'number'; };
const isScalar = (root: SchemaNode, node: SchemaNode) => isTextLeaf(root, node) || kindOf(root, node) === 'boolean';
// inside a promoted nested object, identifying-style keys come first (`secretKeyRef.name / secretKeyRef.key`), then schema order
const byIdKeys = (a: string, b: string) => (ID_KEYS.indexOf(a) + 1 || 99) - (ID_KEYS.indexOf(b) + 1 || 99);

/**
 * How one item of an object list renders (spec 2026-09-08 §5.2), decided by the item schema alone.
 * Leaves: string/number properties, plus the string/number properties of a nested object whose properties
 * are all scalar (`secretKeyRef.name`, `secretKeyRef.key`). Everything else (lists, booleans, deeper
 * objects) is an "extra" reachable through the row's expander; a promoted nested object that also has a
 * boolean (`secretKeyRef.optional`) is both. Pair row = an identifying leaf plus one or two other leaves.
 * `required` lists the item's required top-level keys so an emptied required leaf is set to '' rather than deleted.
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
    if (kindOf(root, s) === 'object' && subKeys.length > 0 && subKeys.every((sk) => isScalar(root, resolve(root, sub[sk])))) {
      const text = subKeys.filter((sk) => isTextLeaf(root, resolve(root, sub[sk]))).sort(byIdKeys);
      for (const sk of text) leaves.push([k, sk]);
      if (text.length < subKeys.length) extras.push(k);
      continue;
    }
    extras.push(k);
  }
  const identifying = ID_KEYS.find((k) => leaves.some((l) => l.length === 1 && l[0] === k)) ?? null;
  const rest = leaves.filter((l) => !(l.length === 1 && l[0] === identifying));
  return { identifying, leaves: rest, extras, required: Array.isArray(r.required) ? r.required.map(String) : [], pair: identifying !== null && rest.length >= 1 && rest.length <= 2 };
}

const ITEM_LABELS: Record<string, string> = {
  secretRefs: 'Variable', env: 'Variable', envFrom: 'Source', hosts: 'Host', paths: 'Path', tls: 'TLS entry', tolerations: 'Toleration',
  hostAliases: 'Host alias', volumeMounts: 'Mount', metrics: 'Metric', endpoints: 'Endpoint', rules: 'Rule', parentRefs: 'Parent', options: 'Option',
};
/** Chip text for adding one item to a list keyed `key` (spec §5.2/§5.3). */
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
