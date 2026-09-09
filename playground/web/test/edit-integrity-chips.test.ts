// The edit-integrity invariant, shard 2 of 2: "Add" chips and clears. Split from
// test/edit-integrity.test.ts purely for wall-clock — ~450 engine renders ≈ 51 s, and vitest runs
// test files in parallel worker threads. EDIT_INTEGRITY=full adds the same sweep over the five
// shipped examples (+263 renders).
import { describe, it, expect, beforeAll } from 'vitest';
import { stringify } from 'yaml';
import examplesJson from '../src/chart-bundle/examples.json';
import { bootEngine, render, why, root, MINIMAL, FULL, SKIP, TIMEOUT } from './integrity';
import { ValuesDocument, type ValuesPath } from '../src/model/ValuesDocument';
import { resolve, schemaAt, type SchemaNode } from '../src/inspector/schema';
import { buildFields, chipValue, type Field } from '../src/inspector/form';
import { defaultName } from '../src/graph/entities';
import { starterBody } from '../src/palette/add';
import { secondariesFor, OWNED_FLAGS, SEC_IDS, WORKLOAD_KEYS } from '../src/graph/secondary';
import { isObj } from '../src/model/guards';

const examples = examplesJson as { id: string; values: string }[];
const STANDALONE = ['configs', 'services', 'ingresses', 'httpRoutes', 'hpas', 'persistentVolumeClaims'];
const workloadHide = (k: string) => OWNED_FLAGS.has(k) || SEC_IDS.has(k);

type Panel = { label: string; node: SchemaNode; path: ValuesPath; hide?: (k: string) => boolean };

/** Same nesting rule as test/edit-integrity.test.ts; see the comment there. */
function* walkFields(node: SchemaNode, basePath: ValuesPath, value: unknown, hide?: (k: string) => boolean, depth = 0): Generator<Field> {
  if (depth > 2) return;
  for (const f of buildFields(root, node, basePath, value, 'advanced', { hide: depth === 0 ? hide : undefined })) {
    yield f;
    if (!f.present) continue;
    const r = resolve(root, f.schema);
    if (f.widget.kind === 'object') {
      yield* walkFields(f.schema, f.path, f.value, undefined, depth + 1);
    } else if (f.widget.kind === 'map' && isObj(f.value)) {
      for (const [k, v] of Object.entries(f.value)) yield* walkFields(r.additionalProperties as SchemaNode, [...f.path, k], v, undefined, depth + 1);
    } else if (f.widget.kind === 'objectList' && Array.isArray(f.value)) {
      for (let i = 0; i < f.value.length; i++) yield* walkFields(r.items as SchemaNode, [...f.path, i], f.value[i], undefined, depth + 1);
    }
  }
}

/** Every panel the inspector opens on this document: one per `<entity>.<name>`, one per secondary block. */
function panelsOf(doc: ValuesDocument): Panel[] {
  const out: Panel[] = [];
  const values = doc.toJS() as Record<string, unknown>;
  for (const [key, entry] of Object.entries(values)) {
    if (!isObj(entry)) continue;
    for (const name of Object.keys(entry)) {
      const node = schemaAt(root, [key, name]);
      if (!node) continue;
      const isWorkload = WORKLOAD_KEYS.has(key);
      out.push({ label: `${key}.${name}`, node, path: [key, name], hide: isWorkload ? workloadHide : undefined });
      if (!isWorkload) continue;
      for (const s of secondariesFor(key)) {
        const blockNode = schemaAt(root, [key, name, s.id]);
        if (!blockNode || doc.valueAt([key, name, s.id]) === undefined) continue;
        out.push({ label: `${key}.${name}.${s.id}`, node: blockNode, path: [key, name, s.id] });
      }
    }
  }
  return out;
}

/** A base document plus every secondary block turned on, so the block panels have something to walk. */
function workloadBase(kind: string): { label: string; text: string } {
  let doc = ValuesDocument.parse(stringify({ [kind]: { app: MINIMAL[kind] } }, { lineWidth: 0 }));
  for (const s of secondariesFor(kind)) {
    const cfg = (doc.toJS() as any)[kind].app as Record<string, any>;
    if (s.blocked?.(cfg, kind)) continue;
    doc = doc.apply(s.on([kind, 'app'], cfg, 'app'));
  }
  return { label: `${kind}/all-on`, text: doc.toString() };
}

function sweep(bases: { label: string; text: string }[], fails: string[]): void {
  for (const base of bases) {
    const start = ValuesDocument.parse(base.text);
    const r0 = render(base.text);
    if (!r0.ok) { fails.push(`BASE ${base.label} does not render → ${why(r0)}`); continue; }
    for (const panel of panelsOf(start)) {
      for (const f of walkFields(panel.node, panel.path, start.valueAt(panel.path), panel.hide)) {
        const id = `${base.label} · ${f.path.join('.')}`;
        if (!f.present) {
          const value = chipValue(root, f);
          const r = render(start.apply([{ op: 'set', path: f.path, value }]).toString());
          if (!r.ok) fails.push(`chip ${id} = ${JSON.stringify(value)} → ${why(r)}`);
        } else if (!(f as Field & { locked?: boolean }).locked) {
          const r = render(start.apply([{ op: 'delete', path: f.path }]).toString());
          if (!r.ok) fails.push(`clear ${id} → ${why(r)}`);
        }
      }
    }
  }
}

describe('edit integrity — chips and clears', () => {
  beforeAll(bootEngine);

  it.skipIf(SKIP)('every Add chip and every clear renders', () => {
    const fails: string[] = [];
    const bases = [...WORKLOAD_KEYS].map(workloadBase);
    for (const key of STANDALONE) {
      const name = defaultName(root, key);
      bases.push({ label: `${key}/starter`, text: stringify({ [key]: { [name]: starterBody(root, key, name) } }, { lineWidth: 0 }) });
    }
    sweep(bases, fails);
    expect(fails).toEqual([]);
  }, TIMEOUT);

  // vitest 5.0.0's ChainableTestAPI type does not re-expose `.runIf` after `.skipIf` (see the same
  // note in test/edit-integrity.test.ts), so this is the equivalent single condition.
  it.skipIf(SKIP || !FULL)('every Add chip and every clear renders on the shipped examples', () => {
    const fails: string[] = [];
    sweep(examples.map((e) => ({ label: e.id, text: e.values })), fails);
    expect(fails).toEqual([]);
  }, TIMEOUT);
});
