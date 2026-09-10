// starterValue() is what every "Add" chip, every object-list "add item" and every palette insert
// writes. It must never emit a value its own schema node rejects (report-edit-integrity M3, B4b).
// A 60-line checker instead of the engine: most $defs nodes are not reachable from a real values
// path, and 550 engine renders would cost ~62 s for a check that needs no templates at all.
import { describe, it, expect } from 'vitest';
import { root } from './integrity';
import { classify, resolve, type SchemaNode } from '../src/inspector/schema';
import { starterValue } from '../src/inspector/form';
import { PATTERN_STARTERS, LEAF_STARTERS, leafStarters } from '../src/inspector/starters';

/** JSON-Schema subset this chart's leaf nodes actually use. Returns one message per violation. */
function violations(value: unknown, node: SchemaNode, where: string): string[] {
  const r = resolve(root, node);
  const out: string[] = [];
  const actual = value === null ? 'null'
    : Array.isArray(value) ? 'array'
    : typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'number')
    : typeof value;
  const types: string[] = Array.isArray(r.type) ? r.type : r.type ? [r.type] : [];
  if (types.length) {
    const ok = types.some((t) => t === actual || (t === 'number' && actual === 'integer'));
    if (!ok) return [`${where}: got ${actual}, want ${types.join('|')}`];
  }
  if (Array.isArray(r.enum) && !r.enum.includes(value as never)) out.push(`${where}: ${JSON.stringify(value)} not in enum`);
  if (typeof r.pattern === 'string' && typeof value === 'string' && !new RegExp(r.pattern).test(value)) out.push(`${where}: ${JSON.stringify(value)} !~ ${r.pattern}`);
  if (typeof r.minimum === 'number' && typeof value === 'number' && value < r.minimum) out.push(`${where}: ${value} < minimum ${r.minimum}`);
  if (typeof r.maximum === 'number' && typeof value === 'number' && value > r.maximum) out.push(`${where}: ${value} > maximum ${r.maximum}`);
  if (typeof r.minLength === 'number' && typeof value === 'string' && value.length < r.minLength) out.push(`${where}: ${JSON.stringify(value)} shorter than minLength ${r.minLength}`);
  if (typeof r.maxLength === 'number' && typeof value === 'string' && value.length > r.maxLength) out.push(`${where}: ${JSON.stringify(value)} longer than maxLength ${r.maxLength}`);
  if (typeof r.minItems === 'number' && Array.isArray(value) && value.length < r.minItems) out.push(`${where}: ${value.length} items < minItems ${r.minItems}`);
  if (Array.isArray(r.required) && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of r.required) if (!(k in (value as Record<string, unknown>))) out.push(`${where}: missing required '${k}'`);
  }
  const alts: SchemaNode[] | undefined = r.oneOf ?? r.anyOf;
  // Only a oneOf/anyOf of *typed* alternatives (the IntOrString shape) is checked here; the
  // "exactly one of these keys" shape is the exclusivity rule, checked by test/inspector-form.test.ts.
  if (Array.isArray(alts) && alts.length > 0 && alts.every((a) => a.type)) {
    if (!alts.some((a) => violations(value, a, where).length === 0)) out.push(`${where}: ${JSON.stringify(value)} matches no oneOf/anyOf branch`);
  }
  return out;
}

describe('starter contract', () => {
  it('starterValue never emits a value its own node rejects', () => {
    const bad: string[] = [];
    for (const [defName, def] of Object.entries(root.$defs as Record<string, SchemaNode>)) {
      const r = resolve(root, def);
      if (!r.properties) continue;
      for (const [key, propSchema] of Object.entries(r.properties as Record<string, SchemaNode>)) {
        const widget = classify(root, propSchema);
        // `yaml` nodes are edited as raw text and `boolean` chips write `true`, not a starter.
        if (widget.kind === 'yaml' || widget.kind === 'boolean') continue;
        bad.push(...violations(starterValue(root, propSchema), propSchema, `${defName}.${key}`));
      }
    }
    expect(bad).toEqual([]);
  });

  it('every pattern the schema leaves without an example has a starter that matches it', () => {
    // Collected by walking every $defs node: a `type: string` node with a `pattern` and neither
    // `examples` nor `default` cannot get a legal starter from the schema, so PATTERN_STARTERS must
    // carry one — and it must satisfy the pattern it is filed under.
    for (const [pattern, value] of Object.entries(PATTERN_STARTERS)) {
      expect(new RegExp(pattern).test(value), `${value} !~ ${pattern}`).toBe(true);
    }
    // every LEAF_STARTERS key still names a real node, and its value satisfies that node
    const leaves = leafStarters(root);
    expect(leaves.size, `${Object.keys(LEAF_STARTERS)} — a key no longer resolves`).toBe(Object.keys(LEAF_STARTERS).length);
    for (const [node, value] of leaves) expect(value.length >= (node.minLength ?? 0)).toBe(true);

    const missing = new Set<string>();
    const missingLeaf: string[] = [];
    const seen = new Set<SchemaNode>();
    const walk = (node: SchemaNode, label: string, depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 8 || seen.has(node)) return;
      seen.add(node);
      const r = resolve(root, node);
      const isString = r.type === 'string' || (Array.isArray(r.type) && r.type.includes('string'));
      if (isString && typeof r.pattern === 'string' && !Array.isArray(r.examples) && r.default === undefined && !(r.pattern in PATTERN_STARTERS)) missing.add(r.pattern);
      // a `minLength`-only string leaf (no `pattern`) is just as unrepresentable by '' as a
      // pattern-constrained one, and can only be keyed by position — LEAF_STARTERS must cover it.
      if (isString && typeof r.pattern !== 'string' && typeof r.minLength === 'number' && r.minLength > 0 && !Array.isArray(r.examples) && r.default === undefined && !leaves.has(r)) missingLeaf.push(label);
      if (r.properties) for (const [k, v] of Object.entries(r.properties as Record<string, SchemaNode>)) walk(v, `${label}.${k}`, depth + 1);
      if (r.items) walk(r.items as SchemaNode, `${label}.items`, depth + 1);
      if (r.additionalProperties && typeof r.additionalProperties === 'object') walk(r.additionalProperties as SchemaNode, `${label}.*`, depth + 1);
    };
    for (const [defName, def] of Object.entries(root.$defs as Record<string, SchemaNode>)) walk(def, defName);
    expect([...missing]).toEqual([]);
    expect(missingLeaf).toEqual([]);
  });
});
