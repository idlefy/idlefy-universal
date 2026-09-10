// The edit-integrity invariant, shard 1 of 2 (chips and clears are test/edit-integrity-chips.test.ts).
//
//   Every EditOp[] any widget can emit, applied to any document the playground itself can produce,
//   must render. The only sanctioned escape is a blocked()/blockedOff() reason (for toggles) or a
//   disabled control (for widgets) — never a silently broken document.
//
// Cost: ~113 ms per engine render. This file is ~165 renders ≈ 21 s; see the plan's Global
// Constraints for the sharding budget. EDIT_INTEGRITY=full adds the exhaustive ordered-pair off
// sweep (~240 renders) that the all-on/each-off sweep below stands in for.
import { describe, it, expect, beforeAll } from 'vitest';
import { stringify } from 'yaml';
import examplesJson from '../src/chart-bundle/examples.json';
import { bootEngine, render, why, root, MINIMAL, FULL, SKIP, TIMEOUT } from './integrity';
import { ValuesDocument, type EditOp, type ValuesPath } from '../src/model/ValuesDocument';
import { resolve, schemaAt, type SchemaNode } from '../src/inspector/schema';
import { buildFields, starterValue, type Field } from '../src/inspector/form';
import { ENTITIES, defaultName, uniqueName } from '../src/graph/entities';
import { addEntityOps, starterBody } from '../src/palette/add';
import { secondariesFor, OWNED_FLAGS, SEC_IDS, WORKLOAD_KEYS } from '../src/graph/secondary';
import { isObj } from '../src/model/guards';

const examples = examplesJson as { id: string; values: string }[];
const STANDALONE = ['configs', 'services', 'ingresses', 'httpRoutes', 'hpas', 'persistentVolumeClaims'];

/** A base document the playground itself can produce, as text. */
type Base = { label: string; text: string };

/** One workload of `kind` named `app`, either schema-minimal-with-port or the palette's starter body. */
const workloadBases = (kind: string): Base[] => [
  { label: `${kind}/minimal`, text: stringify({ [kind]: { app: MINIMAL[kind] } }, { lineWidth: 0 }) },
  { label: `${kind}/starter`, text: stringify({ [kind]: { app: starterBody(root, kind, 'app') } }, { lineWidth: 0 }) },
];

/** The workload keys the group panel owns: hidden from the field list, reached only through switches. */
const workloadHide = (k: string) => OWNED_FLAGS.has(k) || SEC_IDS.has(k);

/**
 * Every `Field` the inspector can show under `node`, nested the way FieldList/Sections nest:
 * object → its properties, map → each entry, objectList → each row. Depth 2 (a row inside a map
 * inside a panel) is deeper than any shipped panel goes; `yaml` widgets are raw text, not fields.
 * `hide` applies at the panel's own level only, like the real WorkloadPanel.
 */
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

describe('edit integrity', () => {
  beforeAll(bootEngine);

  it.skipIf(SKIP)('every group-panel toggle can be switched on', () => {
    const fails: string[] = [];
    for (const kind of WORKLOAD_KEYS) {
      for (const base of workloadBases(kind)) {
        const start = ValuesDocument.parse(base.text);
        for (const s of secondariesFor(kind)) {
          const cfg = (start.toJS() as any)[kind].app as Record<string, any>;
          if (s.blocked?.(cfg, kind)) continue;   // the switch is disabled and says why
          const r = render(start.apply(s.on([kind, 'app'], cfg, 'app')).toString());
          if (!r.ok) fails.push(`on ${base.label}/${s.id} → ${why(r)}`);
        }
      }
    }
    expect(fails).toEqual([]);
  }, TIMEOUT);

  it.skipIf(SKIP)('every group-panel toggle can be switched off with all the others on', () => {
    const fails: string[] = [];
    for (const kind of WORKLOAD_KEYS) {
      const base = workloadBases(kind)[0];
      let allOn = ValuesDocument.parse(base.text);
      const applied = [] as ReturnType<typeof secondariesFor>;
      for (const s of secondariesFor(kind)) {
        const cfg = (allOn.toJS() as any)[kind].app as Record<string, any>;
        if (s.blocked?.(cfg, kind)) continue;
        allOn = allOn.apply(s.on([kind, 'app'], cfg, 'app'));
        applied.push(s);
      }
      const r0 = render(allOn.toString());
      if (!r0.ok) { fails.push(`all-on ${kind} → ${why(r0)}`); continue; }
      const cfgAllOn = (allOn.toJS() as any)[kind].app as Record<string, any>;
      for (const s of applied) {
        if (s.isOn(cfgAllOn) && s.blockedOff?.(cfgAllOn, kind)) continue;   // the switch is disabled and says why
        const r = render(allOn.apply(s.off([kind, 'app'])).toString());
        if (!r.ok) fails.push(`off ${kind}/${s.id} (all others on) → ${why(r)}`);
      }
    }
    expect(fails).toEqual([]);
  }, TIMEOUT);

  // The exhaustive sweep the all-on/each-off case stands in for: it found exactly one failing pair
  // (rbac + serviceAccount) across 330 sequences, at ten times the engine cost.
  // vitest 5.0.0's ChainableTestAPI type does not re-expose `.runIf` after `.skipIf` (the runtime object
  // does support the chain — see createTaskCollector/createChainable in vitest's dist), so this is
  // written as the equivalent single condition: skip unless FULL is set and SKIP is not.
  it.skipIf(SKIP || !FULL)('every ordered toggle pair renders after the second is switched off', () => {
    const fails: string[] = [];
    for (const kind of ['deployments', 'statefulSets', 'daemonSets']) {
      const base = workloadBases(kind)[0];
      const secs = secondariesFor(kind);
      for (const a of secs) for (const b of secs) {
        if (a.id === b.id) continue;
        let doc = ValuesDocument.parse(base.text);
        let skip = false;
        for (const s of [a, b]) {
          const cfg = (doc.toJS() as any)[kind].app as Record<string, any>;
          if (s.blocked?.(cfg, kind)) { skip = true; break; }
          doc = doc.apply(s.on([kind, 'app'], cfg, 'app'));
        }
        if (skip) continue;
        const before = render(doc.toString());
        if (!before.ok) { fails.push(`pair ${kind}/${a.id}+${b.id} → ${why(before)}`); continue; }
        const cfg = (doc.toJS() as any)[kind].app as Record<string, any>;
        if (b.isOn(cfg) && b.blockedOff?.(cfg, kind)) continue;
        const after = render(doc.apply(b.off([kind, 'app'])).toString());
        if (!after.ok) fails.push(`pair ${kind}/${a.id} on + ${b.id} off → ${why(after)}`);
      }
    }
    expect(fails).toEqual([]);
  }, TIMEOUT);

  it.skipIf(SKIP)('every palette insertion renders, into an empty document and into every example', () => {
    const fails: string[] = [];
    const bases: Base[] = [{ label: 'empty', text: '' }, ...examples.map((e) => ({ label: e.id, text: e.values }))];
    for (const base of bases) {
      const start = ValuesDocument.parse(base.text);
      const values = start.toJS() as Record<string, unknown>;
      for (const e of ENTITIES) {
        const existing = Object.keys(isObj(values[e.key]) ? (values[e.key] as object) : {});
        const name = uniqueName(defaultName(root, e.key), existing);
        const r = render(start.apply(addEntityOps(root, e.key, name)).toString());
        if (!r.ok) fails.push(`add ${e.key}.${name} into ${base.label} → ${why(r)}`);
      }
    }
    expect(fails).toEqual([]);
  }, TIMEOUT);

  it.skipIf(SKIP)('every object list can gain an item and lose any item', () => {
    const fails: string[] = [];
    const bases: Base[] = [];
    for (const kind of WORKLOAD_KEYS) bases.push(workloadBases(kind)[0]);
    for (const key of STANDALONE) {
      const name = defaultName(root, key);
      bases.push({ label: `${key}/starter`, text: stringify({ [key]: { [name]: starterBody(root, key, name) } }, { lineWidth: 0 }) });
    }
    for (const base of bases) {
      const start = ValuesDocument.parse(base.text);
      const values = start.toJS() as Record<string, unknown>;
      for (const [key, entry] of Object.entries(values)) {
        if (!isObj(entry)) continue;
        for (const [name, body] of Object.entries(entry)) {
          const node = schemaAt(root, [key, name]);
          if (!node) continue;
          const hide = WORKLOAD_KEYS.has(key) ? workloadHide : undefined;
          for (const f of walkFields(node, [key, name], body, hide)) {
            if (f.widget.kind !== 'objectList' || !Array.isArray(f.value)) continue;
            const items = f.value as unknown[];
            const item = resolve(root, f.schema).items as SchemaNode;
            // ObjectListField.append: set the next index, never rewrite the array (Task 16 replaces
            // starterValue here with appendItemValue, the same call the widget makes).
            const added: EditOp[] = [{ op: 'set', path: [...f.path, items.length], value: starterValue(root, item) }];
            const ra = render(start.apply(added).toString());
            if (!ra.ok) fails.push(`append ${base.label} · ${f.path.join('.')} → ${why(ra)}`);
            for (let i = 0; i < items.length; i++) {
              // ObjectListField.remove: the last item takes the whole key with it. When the key is
              // locked (schema-required or chart-required) the widget disables that × instead.
              if (items.length === 1 && f.locked) continue;
              const removed: EditOp[] = items.length === 1
                ? [{ op: 'delete', path: f.path }]
                : [{ op: 'delete', path: [...f.path, i] }];
              const rr = render(start.apply(removed).toString());
              if (!rr.ok) fails.push(`remove ${base.label} · ${f.path.join('.')}[${i}] → ${why(rr)}`);
            }
          }
        }
      }
    }
    expect(fails).toEqual([]);
  }, TIMEOUT);
});
