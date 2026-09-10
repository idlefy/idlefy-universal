// The edit-integrity invariant, shard 1 of 2 (chips and clears are test/edit-integrity-chips.test.ts).
//
//   Every EditOp[] any widget can emit, applied to any document the playground itself can produce,
//   must render. The only sanctioned escape is a blocked()/blockedOff() reason (for toggles) or a
//   disabled control (for widgets) — never a silently broken document.
//
// Cost: ~113 ms per engine render. This file's default-shard tests together take ~19 s measured on
// dev hardware; see the plan's Global Constraints for the sharding budget. EDIT_INTEGRITY=full adds
// the exhaustive ordered-pair off sweep that the all-on/each-off sweep below stands in for.
import { describe, it, expect, beforeAll } from 'vitest';
import { stringify } from 'yaml';
import examplesJson from '../src/chart-bundle/examples.json';
import { bootEngine, render, why, root, workloadHide, walkFields, MINIMAL, FULL, SKIP, TIMEOUT } from './integrity';
import { ValuesDocument, type EditOp } from '../src/model/ValuesDocument';
import { resolve, schemaAt, type SchemaNode } from '../src/inspector/schema';
import { appendItemValue, itemShape, leafEditOps, starterValue } from '../src/inspector/form';
import { ENTITIES, defaultName, uniqueName } from '../src/graph/entities';
import { addEntityOps, starterBody } from '../src/palette/add';
import { secondariesFor, toggleState, WORKLOAD_KEYS } from '../src/graph/secondary';
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

describe('edit integrity', () => {
  beforeAll(bootEngine);

  it.skipIf(SKIP)('every group-panel toggle can be switched on', () => {
    const fails: string[] = [];
    for (const kind of WORKLOAD_KEYS) {
      for (const base of workloadBases(kind)) {
        const start = ValuesDocument.parse(base.text);
        for (const s of secondariesFor(kind)) {
          const cfg = (start.toJS() as any)[kind].app as Record<string, any>;
          if (toggleState(s, cfg, kind, false).isDisabled) continue;   // the switch is disabled and says why
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
        if (toggleState(s, cfg, kind, false).isDisabled) continue;
        allOn = allOn.apply(s.on([kind, 'app'], cfg, 'app'));
        applied.push(s);
      }
      const r0 = render(allOn.toString());
      if (!r0.ok) { fails.push(`all-on ${kind} → ${why(r0)}`); continue; }
      const cfgAllOn = (allOn.toJS() as any)[kind].app as Record<string, any>;
      for (const s of applied) {
        if (toggleState(s, cfgAllOn, kind, false).isDisabled) continue;   // the switch is disabled and says why
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
          if (toggleState(s, cfg, kind, false).isDisabled) { skip = true; break; }
          doc = doc.apply(s.on([kind, 'app'], cfg, 'app'));
        }
        if (skip) continue;
        const before = render(doc.toString());
        if (!before.ok) { fails.push(`pair ${kind}/${a.id}+${b.id} → ${why(before)}`); continue; }
        const cfg = (doc.toJS() as any)[kind].app as Record<string, any>;
        if (toggleState(b, cfg, kind, false).isDisabled) continue;
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
    // I-2: every MINIMAL workload above has exactly one container port and autoCreateService unset,
    // so the ports-map branch below never actually exercises its own exemption there. Add the one
    // combination that does: autoCreateService on with that same sole port still in place — a
    // StatefulSet hard-fails without it (`_validation.tpl`), a Deployment silently loses its Service.
    for (const kind of ['deployments', 'statefulSets']) {
      bases.push({ label: `${kind}/autoCreateService`, text: stringify({ [kind]: { app: { ...MINIMAL[kind], autoCreateService: true } } }, { lineWidth: 0 }) });
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
          const autoCreateService = isObj(body) && (body as Record<string, unknown>).autoCreateService === true;
          for (const f of walkFields(node, [key, name], body, hide)) {
            if ((f.widget.kind === 'objectList' || f.widget.kind === 'list') && Array.isArray(f.value)) {
              const items = f.value as unknown[];
              const item = resolve(root, f.schema).items as SchemaNode;
              // ObjectListField.append: set the next index, never rewrite the array (Task 16 replaces
              // starterValue here with appendItemValue, the same call the widget makes). ListField.append
              // uses starterValue directly — a scalar list item has no identity to rename or de-duplicate.
              const value = f.widget.kind === 'objectList' ? appendItemValue(root, item, items) : starterValue(root, item);
              const added: EditOp[] = [{ op: 'set', path: [...f.path, items.length], value }];
              const ra = render(start.apply(added).toString());
              if (!ra.ok) fails.push(`append ${base.label} · ${f.path.join('.')} → ${why(ra)}`);
              for (let i = 0; i < items.length; i++) {
                // ObjectListField/ListField.remove: the last item takes the whole key with it. When the
                // key is locked (schema-required or chart-required) the widget disables that × instead.
                if (items.length === 1 && f.locked) continue;
                const removed: EditOp[] = items.length === 1
                  ? [{ op: 'delete', path: f.path }]
                  : [{ op: 'delete', path: [...f.path, i] }];
                const rr = render(start.apply(removed).toString());
                if (!rr.ok) fails.push(`remove ${base.label} · ${f.path.join('.')}[${i}] → ${why(rr)}`);
              }
            } else if (f.key === 'ports' && f.widget.kind === 'map' && isObj(f.value)) {
              // PortsTable's per-port ×: a map, not an objectList, so walkFields yields it as a plain
              // field rather than recursing into per-row remove ops — the last entry disables that ×
              // the same way, but only while autoCreateService needs a port to build the Service from.
              const names = Object.keys(f.value);
              for (const n of names) {
                if (names.length === 1 && autoCreateService) continue;
                const removed: EditOp[] = [{ op: 'delete', path: [...f.path, n] }];
                const rr = render(start.apply(removed).toString());
                if (!rr.ok) fails.push(`remove ${base.label} · ${f.path.join('.')}.${n} → ${why(rr)}`);
              }
            }
          }
        }
      }
    }
    expect(fails).toEqual([]);
  }, TIMEOUT);

  it.skipIf(SKIP)('an exclusive pair can be swapped either way, and neither half can be emptied away', () => {
    const fails: string[] = [];
    // Every object list whose item declares an exclusive group, on the two documents that carry one.
    const bases = [
      // `subdomain` is only legal with a global domain (computedIngressHost: "Global domain must be
      // specified when a subdomain is used."), so the swap direction is only reachable from a document
      // that has one. A from-scratch document reaches the same rows through REF_FIXUPS' `host`.
      { label: 'ingresses/starter', text: stringify({ generic: { ingressesGeneral: { domain: 'example.com' } }, ingresses: { site: starterBody(root, 'ingresses', 'site') } }, { lineWidth: 0 }) },
      { label: 'httpRoutes/starter', text: stringify({ generic: { ingressesGeneral: { domain: 'example.com' } }, httpRoutes: { r: starterBody(root, 'httpRoutes', 'r') } }, { lineWidth: 0 }) },
      { label: 'deployments/env', text: stringify({ deployments: { app: { ...MINIMAL.deployments, containers: { main: { ...(MINIMAL.deployments.containers as any).main, env: [{ name: 'LOG_LEVEL', value: 'info' }] } } } } }, { lineWidth: 0 }) },
      // EnvFrom (type/configName/prefix) is a pair row with no exclusive group — its non-required,
      // non-exclusive `prefix` leaf is the render-check target for the plain-delete branch below.
      { label: 'deployments/envFrom', text: stringify({ deployments: { app: { ...MINIMAL.deployments, containers: { main: { ...(MINIMAL.deployments.containers as any).main, envFrom: [{ type: 'configMap', configName: 'cfg', prefix: 'PRE_' }] } } } } }, { lineWidth: 0 }) },
    ];
    for (const base of bases) {
      const start = ValuesDocument.parse(base.text);
      const values = start.toJS() as Record<string, unknown>;
      for (const [key, entry] of Object.entries(values)) {
        if (!isObj(entry)) continue;
        for (const [name, body] of Object.entries(entry)) {
          const node = schemaAt(root, [key, name]);
          if (!node) continue;
          for (const f of walkFields(node, [key, name], body, WORKLOAD_KEYS.has(key) ? workloadHide : undefined)) {
            if (f.widget.kind !== 'objectList' || !Array.isArray(f.value)) continue;
            const item = resolve(root, f.schema).items as SchemaNode;
            const shape = itemShape(root, item);
            // A pair row's own leaves never reach buildFields/AddChips (ObjectListField hides them —
            // see walkFields' hideRowLeaves, only applied `pair ? … : undefined` — mirroring
            // ObjectListField.tsx's own `hide = pair ? hideLeaves : undefined`), so the plain-`delete`
            // branch of leafEditOps for a leaf that is neither required nor part of an exclusive group
            // (EnvFrom.prefix: `type`/`configName` are required, there is no exclusive group) is only
            // reachable here, through leafEditOps directly, never through the chip/clear sweep.
            if (shape.pair) {
              const props = resolve(root, item).properties as Record<string, SchemaNode>;
              (f.value as unknown[]).forEach((row, i) => {
                if (!isObj(row)) return;
                for (const l of shape.leaves) {
                  if (l.length !== 1) continue;   // only top-level leaves; nested ones hold via nestedLeafRequired
                  const k = l[0];
                  if (shape.required.includes(k) || shape.exclusive.includes(k)) continue;
                  if ((row as Record<string, unknown>)[k] === undefined) continue;
                  const ops = leafEditOps(root, shape, item, f.path, i, row, [k], resolve(root, props[k]), '');
                  expect(ops, `${base.label} clear ${f.path.join('.')}[${i}].${k}`).toEqual([{ op: 'delete', path: [...f.path, i, k] }]);
                  const r = render(start.apply(ops!).toString());
                  if (!r.ok) fails.push(`clear ${base.label} · ${f.path.join('.')}[${i}].${k} → ${why(r)}`);
                }
              });
            }
            if (shape.exclusive.length === 0) continue;
            (f.value as unknown[]).forEach((row, i) => {
              for (const k of shape.exclusive) {
                if (!isObj(row) || (row as Record<string, unknown>)[k] !== undefined) continue;
                const leafSchema = resolve(root, (resolve(root, item).properties as Record<string, SchemaNode>)[k]);
                // only scalar members can be typed into the row; `valueFrom` is added from a chip
                if (leafSchema.type !== 'string') continue;
                const ops = leafEditOps(root, shape, item, f.path, i, row, [k], leafSchema, k === 'subdomain' ? 'api' : 'x');
                expect(ops, `${base.label} ${f.path.join('.')}[${i}].${k}`).not.toBeNull();
                const r = render(start.apply(ops!).toString());
                if (!r.ok) fails.push(`swap ${base.label} · ${f.path.join('.')}[${i}] → ${k} → ${why(r)}`);
              }
              // emptying the member that *is* set must emit nothing at all
              for (const k of shape.exclusive) {
                if (!isObj(row) || (row as Record<string, unknown>)[k] === undefined) continue;
                const props = resolve(root, item).properties as Record<string, SchemaNode>;
                expect(leafEditOps(root, shape, item, f.path, i, row, [k], resolve(root, props[k]), ''), `${base.label} clear ${k}`).toBeNull();
              }
            });
          }
        }
      }
    }
    expect(fails).toEqual([]);
  }, TIMEOUT);
});
