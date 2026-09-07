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

/**
 * A value that satisfies the node well enough to render: the first `examples` entry when it fits the
 * node's own properties, else required keys only. Some docs examples describe the *map entry* that
 * holds the node (PortSpec.examples[0] is `{http: {containerPort: …}}`), so a single-key example whose
 * inner object fits the properties is unwrapped.
 */
export function starterValue(root: SchemaNode, node: SchemaNode): unknown {
  const r = resolve(root, node);
  const props = isObj(r.properties) ? (r.properties as Record<string, unknown>) : undefined;
  const fits = (ex: unknown) => !props || r.additionalProperties !== false || (isObj(ex) && Object.keys(ex).every((k) => k in props));
  if (Array.isArray(r.examples) && r.examples.length) {
    const ex = r.examples[0];
    if (fits(ex)) return ex;
    if (isObj(ex) && Object.keys(ex).length === 1) { const inner = Object.values(ex)[0]; if (fits(inner)) return inner; }
  }
  const t = Array.isArray(r.type) ? r.type[0] : r.type;
  if (r.enum?.length) return r.enum[0];
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
  return {};
}
