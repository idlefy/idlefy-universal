import type { ValuesPath } from '../model/ValuesDocument';
import { isObj as isObjGuard, isScalar } from '../model/guards';

export type SchemaNode = Record<string, any>;
export type Widget =
  | { kind: 'boolean' }
  | { kind: 'number'; integer: boolean; min?: number; max?: number }
  | { kind: 'string'; enum?: string[]; pattern?: string; intOrString?: true }
  | { kind: 'list'; enum?: string[] }
  | { kind: 'keyvalue' }
  | { kind: 'object' }
  | { kind: 'map'; keyPattern?: string }
  | { kind: 'objectList' }
  | { kind: 'mapOfLists' }
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

const isObj = (v: unknown): v is SchemaNode => isObjGuard<SchemaNode>(v);

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

/** Dereferences and folds `allOf` members that carry properties/required into the node. */
export function resolve(root: SchemaNode, node: SchemaNode): SchemaNode {
  const d = deref(root, node) ?? node;
  if (!Array.isArray(d.allOf)) return d;
  const out: SchemaNode = { ...d, properties: { ...(d.properties ?? {}) }, required: [...(d.required ?? [])] };
  delete out.allOf;
  for (const raw of d.allOf) {
    const m = deref(root, raw) ?? raw;
    if (m.if || m.then) continue;
    Object.assign(out.properties, m.properties ?? {});
    for (const r of m.required ?? []) if (!out.required.includes(r)) out.required.push(r);
  }
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

// spec 2026-09-08 §5.2: upstream item types small enough to edit as rows; every other k8s.io.* item stays raw YAML
const OBJECT_LIST_ALLOW = new Set(['k8s.io.api.core.v1.Toleration', 'k8s.io.api.core.v1.PodDNSConfigOption']);
/** True when an array's `items` is an object with declared properties that is not an (un-allow-listed) k8s.io.* type. */
export function isObjectListItem(root: SchemaNode, items: SchemaNode | undefined): boolean {
  if (!isObj(items)) return false;
  const item = resolve(root, items);
  if (!isObj(item.properties) || Object.keys(item.properties).length === 0) return false;
  const ref = item['x-ref-name'];
  return !(typeof ref === 'string' && ref.startsWith('k8s.io.') && !OBJECT_LIST_ALLOW.has(ref));
}

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
    return isObjectListItem(root, r.items) ? { kind: 'objectList' } : { kind: 'yaml' };
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
      if (apt === 'array') return isObjectListItem(root, apr.items) ? { kind: 'mapOfLists' } : { kind: 'yaml' };
      return hasNonScalarExamples(r) ? { kind: 'yaml' } : { kind: 'keyvalue' };
    }
    return hasNonScalarExamples(r) ? { kind: 'yaml' } : { kind: 'keyvalue' };
  }
  return { kind: 'yaml' };
}
