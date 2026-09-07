import type { ValuesPath } from '../model/ValuesDocument';

export type SchemaNode = Record<string, any>;
export type Widget =
  | { kind: 'boolean' }
  | { kind: 'number'; integer: boolean; min?: number; max?: number }
  | { kind: 'string'; enum?: string[]; pattern?: string; intOrString?: true }
  | { kind: 'list'; enum?: string[] }
  | { kind: 'keyvalue' }
  | { kind: 'object' }
  | { kind: 'map'; keyPattern?: string }
  | { kind: 'yaml' };

const REF = '#/$defs/';
export function deref(root: SchemaNode, node: SchemaNode | undefined, depth = 0): SchemaNode | undefined {
  if (!node || depth > 32) return node;
  const ref = node.$ref;
  if (typeof ref !== 'string' || !ref.startsWith(REF)) return node;
  const target = root.$defs?.[ref.slice(REF.length)];
  if (!target) return undefined;
  // Sibling keywords next to $ref (description, x-ui-tier) win over the target's.
  const { $ref: _r, ...siblings } = node;
  return { ...deref(root, target, depth + 1), ...siblings, 'x-ref-name': ref.slice(REF.length) };
}

const isObj = (v: unknown): v is SchemaNode => !!v && typeof v === 'object' && !Array.isArray(v);
const isScalar = (v: unknown): boolean => v === null || typeof v !== 'object';

/** True when at least one `examples` entry is an object with a non-scalar (object/array) value —
 *  a flat key/value widget can't represent that, so the node needs the `yaml` widget instead. */
const hasNonScalarExamples = (n: SchemaNode): boolean => {
  const examples = Array.isArray(n.examples) ? n.examples : [];
  return examples.some((ex: unknown) => isObj(ex) && Object.values(ex).some((v) => !isScalar(v)));
};

/** True for a node (or its `oneOf`/`anyOf` alternatives) that admits both a number and a string —
 *  Kubernetes' IntOrString shape, used for things like PDB `minAvailable` or `targetPort`. */
const isIntOrString = (n: SchemaNode): boolean => {
  if (Array.isArray(n.type)) {
    const types = new Set(n.type);
    if ((types.has('integer') || types.has('number')) && types.has('string')) return true;
  }
  const alts = n.oneOf ?? n.anyOf;
  if (Array.isArray(alts)) {
    const types = alts.map((a: SchemaNode) => a.type).filter(Boolean);
    const hasNum = types.some((t: string) => t === 'integer' || t === 'number');
    const hasStr = types.some((t: string) => t === 'string');
    if (hasNum && hasStr) return true;
  }
  return false;
};

/** Dereferences and folds `allOf` members that carry properties/required into the node. if/then members are kept aside for conditionalHints. */
export function resolve(root: SchemaNode, node: SchemaNode): SchemaNode {
  const d = deref(root, node) ?? node;
  if (!Array.isArray(d.allOf)) return d;
  const out: SchemaNode = { ...d, properties: { ...(d.properties ?? {}) }, required: [...(d.required ?? [])] };
  delete out.allOf;
  const conditionals: SchemaNode[] = [];
  for (const raw of d.allOf) {
    const m = deref(root, raw) ?? raw;
    if (m.if || m.then) { conditionals.push(m); continue; }
    Object.assign(out.properties, m.properties ?? {});
    for (const r of m.required ?? []) if (!out.required.includes(r)) out.required.push(r);
  }
  if (conditionals.length) out['x-conditionals'] = conditionals;
  if (out.required.length === 0) delete out.required;
  return out;
}

/** Schema node describing the value at `path`, or undefined when the schema has no such node. */
export function schemaAt(root: SchemaNode, path: ValuesPath): SchemaNode | undefined {
  let node: SchemaNode | undefined = root;
  for (const seg of path) {
    if (!node) return undefined;
    const r = resolve(root, node);
    if (typeof seg === 'number') { node = isObj(r.items) ? r.items : undefined; continue; }
    if (isObj(r.properties) && isObj(r.properties[seg])) node = r.properties[seg];
    else if (isObj(r.additionalProperties)) node = r.additionalProperties;
    else node = undefined;
  }
  return node;
}

const scalarType = (n: SchemaNode): string | undefined => {
  const t = Array.isArray(n.type) ? n.type.find((x: string) => x !== 'null') : n.type;
  if (t) return t;
  if (n.enum) return 'string';
  if (n.oneOf || n.anyOf) {
    const alts = (n.oneOf ?? n.anyOf).map((a: SchemaNode) => a.type).filter(Boolean);
    if (alts.length && alts.every((a: string) => ['string', 'integer', 'number'].includes(a))) return 'string';
  }
  return undefined;
};

export function classify(root: SchemaNode, node: SchemaNode): Widget {
  const r = resolve(root, node);
  if (typeof r['x-ref-name'] === 'string' && r['x-ref-name'].startsWith('k8s.io.')) return { kind: 'yaml' };
  const t = scalarType(r);
  if (t === 'boolean') return { kind: 'boolean' };
  if (t === 'integer' || t === 'number') {
    const w: Widget = { kind: 'number', integer: t === 'integer' };
    if (typeof r.minimum === 'number') w.min = r.minimum;
    if (typeof r.maximum === 'number') w.max = r.maximum;
    return w;
  }
  if (t === 'string') {
    const w: Widget = { kind: 'string' };
    if (Array.isArray(r.enum)) w.enum = r.enum.map(String);
    if (typeof r.pattern === 'string') w.pattern = r.pattern;
    if (isIntOrString(r)) w.intOrString = true;
    return w;
  }
  if (t === 'array') {
    const item = isObj(r.items) ? resolve(root, r.items) : undefined;
    const it = item ? scalarType(item) : undefined;
    if (it && it !== 'object' && it !== 'array') return item?.enum ? { kind: 'list', enum: item.enum.map(String) } : { kind: 'list' };
    return { kind: 'yaml' };
  }
  if (t === 'object' || isObj(r.properties) || r.additionalProperties !== undefined) {
    if (isObj(r.properties) && Object.keys(r.properties).length > 0) return { kind: 'object' };
    const ap = r.additionalProperties;
    if (isObj(ap)) {
      const apr = resolve(root, ap);
      const apt = scalarType(apr);
      if (apt === 'object' || isObj(apr.properties)) {
        const w: Widget = { kind: 'map' };
        if (typeof r.propertyNames?.pattern === 'string') w.keyPattern = r.propertyNames.pattern;
        return w;
      }
      if (apt === 'array') return { kind: 'yaml' };
      return hasNonScalarExamples(r) ? { kind: 'yaml' } : { kind: 'keyvalue' };
    }
    return hasNonScalarExamples(r) ? { kind: 'yaml' } : { kind: 'keyvalue' };
  }
  return { kind: 'yaml' };
}

/** "<flag>: <const> requires <field>[: <const>]" lines derived from allOf if/then members. */
export function conditionalHints(root: SchemaNode, node: SchemaNode): string[] {
  const r = resolve(root, node);
  const out: string[] = [];
  for (const c of r['x-conditionals'] ?? []) {
    const cond = Object.entries<any>(c.if?.properties ?? {}).map(([k, v]) => `${k}: ${JSON.stringify(v.const)}`).join(', ');
    const then = c.then ?? {};
    const consts = Object.entries<any>(then.properties ?? {}).map(([k, v]) => `${k}: ${JSON.stringify(v.const)}`);
    const reqs = (then.required ?? []).filter((k: string) => !(then.properties ?? {})[k]);
    for (const x of [...consts, ...reqs]) out.push(`${cond} requires ${x}`);
  }
  return out;
}
