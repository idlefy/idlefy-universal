// starterValue() is what every "Add" chip, every object-list "add item" and every palette insert
// writes. It must never emit a value its own schema node rejects (report-edit-integrity M3, B4b).
// A 60-line checker instead of the engine: most $defs nodes are not reachable from a real values
// path, and 550 engine renders would cost ~62 s for a check that needs no templates at all.
import { describe, it, expect } from 'vitest';
import { root } from './integrity';
import { classify, resolve, type SchemaNode } from '../src/inspector/schema';
import { starterValue } from '../src/inspector/form';

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
});
