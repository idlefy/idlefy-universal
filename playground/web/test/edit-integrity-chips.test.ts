// The edit-integrity invariant, shard 2 of 2: "Add" chips and clears. Split from
// test/edit-integrity.test.ts purely for wall-clock — this sweep takes ~46 s on its own, measured on
// dev hardware, and vitest runs test files in parallel worker threads. EDIT_INTEGRITY=full adds the
// same sweep over the five shipped examples.
import { describe, it, expect, beforeAll } from 'vitest';
import { stringify } from 'yaml';
import examplesJson from '../src/chart-bundle/examples.json';
import { bootEngine, render, why, root, workloadHide, walkFields, MINIMAL, FULL, SKIP, TIMEOUT } from './integrity';
import { ValuesDocument, type ValuesPath } from '../src/model/ValuesDocument';
import { resolve, schemaAt, type SchemaNode } from '../src/inspector/schema';
import { chipValue, starterValue } from '../src/inspector/form';
import { defaultName } from '../src/graph/entities';
import { starterBody } from '../src/palette/add';
import { secondariesFor, toggleState, WORKLOAD_KEYS } from '../src/graph/secondary';
import { secretRefUsers, subdomainUsers } from '../src/inspector/summary';
import { isFilledObj, isObj } from '../src/model/guards';

const examples = examplesJson as { id: string; values: string }[];
const STANDALONE = ['configs', 'services', 'ingresses', 'httpRoutes', 'hpas', 'persistentVolumeClaims'];

type Panel = { label: string; node: SchemaNode; path: ValuesPath; hide?: (k: string) => boolean };

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
        // AutoCreated.tsx only offers Open for a secondary that is on or already has a body
        // (`node ?? (p.hasSchema(s.id) && (on || configured) ? blockId(...) : null)`) — off + empty
        // means the switch is the only affordance, so a block that exists with its autoCreate* flag
        // off still gets walked (SecondaryPanel builds its fields from schemaAt/doc.valueAt whenever
        // the panel is reached), but an off + never-configured block never does.
        const blockNode = schemaAt(root, [key, name, s.id]);
        if (!blockNode) continue;
        const raw = doc.valueAt([key, name]);
        const cfg = isObj(raw) ? raw : {};
        if (!(s.isOn(cfg) || isFilledObj(cfg[s.id]))) continue;
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
    if (toggleState(s, cfg, kind, false).isDisabled) continue;
    doc = doc.apply(s.on([kind, 'app'], cfg, 'app'));
  }
  return { label: `${kind}/all-on`, text: doc.toString() };
}

/**
 * A document with every `generic.*` sub-block populated — one property per key `generic`'s own schema
 * declares (`annotations`, `ingressesGeneral`, …). `panelsOf()` only ever walks entity/secondary
 * panels (each `<key>.<name>` under `deployments`, `ingresses`, …); `generic` itself is never one, so
 * none of its own block-level clears (the × ReleasePanel's `FieldRow` renders for each object-shaped
 * sub-block) ever reach `walkFields`. `withSubdomain` also puts a `hosts[].subdomain` entry in the
 * document, so `generic.ingressesGeneral` sits in `lockedPaths` the same way ReleasePanel computes it
 * — proving the lock is actually honoured here, not just present in an unreachable spot.
 */
function genericBase(withSubdomain: boolean): { label: string; text: string } {
  const genericNode = schemaAt(root, ['generic'])!;
  const generic: Record<string, unknown> = {};
  for (const key of Object.keys(resolve(root, genericNode).properties as Record<string, SchemaNode>)) {
    generic[key] = starterValue(root, schemaAt(root, ['generic', key])!);
  }
  const doc: Record<string, unknown> = { generic };
  if (withSubdomain) {
    doc.ingresses = { site: { hosts: [{ subdomain: 'api', paths: [{ path: '/', pathType: 'Prefix' }] }] } };
  }
  return { label: withSubdomain ? 'generic/all-on+subdomain' : 'generic/all-on', text: stringify(doc, { lineWidth: 0 }) };
}

/**
 * `secretRefs` with four groups spanning every combination `ReleasePanel`'s `blockedRemove` / last-row
 * rule branches on: referenced by a container vs. never referenced, single item vs. multiple. One
 * `deployments.app` container names the two `used-*` groups via `secretRefs: [...]`; the `free-*`
 * groups are never referenced by anything, so `secretRefUsers` reports no users for them.
 */
function secretRefsBase(): { label: string; text: string } {
  const doc = {
    deployments: {
      app: {
        containers: { main: { image: 'nginx', imageTag: '1', ports: { http: { containerPort: 80 } }, secretRefs: ['used-multi', 'used-single'] } },
      },
    },
    secretRefs: {
      'used-multi': [
        { name: 'A', secretKeyRef: { name: 's', key: 'a' } },
        { name: 'B', secretKeyRef: { name: 's', key: 'b' } },
      ],
      'used-single': [{ name: 'C', secretKeyRef: { name: 's', key: 'c' } }],
      'free-multi': [
        { name: 'D', secretKeyRef: { name: 's', key: 'd' } },
        { name: 'E', secretKeyRef: { name: 's', key: 'e' } },
      ],
      'free-single': [{ name: 'F', secretKeyRef: { name: 's', key: 'f' } }],
    },
  };
  return { label: 'secretRefs/mixed', text: stringify(doc, { lineWidth: 0 }) };
}

function sweep(bases: { label: string; text: string }[], fails: string[]): void {
  for (const base of bases) {
    const start = ValuesDocument.parse(base.text);
    const r0 = render(base.text);
    if (!r0.ok) { fails.push(`BASE ${base.label} does not render → ${why(r0)}`); continue; }
    const values = start.toJS() as Record<string, unknown>;
    // Mirrors ReleasePanel's own `lockedPaths`: while any `hosts[]`/`hostnames[]` entry anywhere in
    // this document sets `subdomain`, `generic.ingressesGeneral.domain` — and the `ingressesGeneral`
    // block itself, whose own clear × would take `domain` with it — cannot be cleared either, a
    // runtime lock buildFields cannot express on path shape alone (see buildFields' doc comment).
    const lockedPaths = subdomainUsers(values).length > 0 ? new Set(['generic.ingressesGeneral.domain', 'generic.ingressesGeneral']) : undefined;
    // `generic.*`'s own block-level clears (see `genericBase`'s doc comment) are not reachable through
    // any panel, so they get their own direct check here rather than through `panelsOf`/`walkFields`.
    if (isObj(values.generic)) {
      for (const key of Object.keys(values.generic as Record<string, unknown>)) {
        const path = ['generic', key];
        if (lockedPaths?.has(path.join('.'))) continue;
        const r = render(start.apply([{ op: 'delete', path }]).toString());
        if (!r.ok) fails.push(`clear ${base.label} · ${path.join('.')} → ${why(r)}`);
      }
    }
    // `secretRefs`' own card × (`delete ['secretRefs', g]`) and row × (`delete ['secretRefs', g, i]`)
    // are release-level actions `panelsOf`/`walkFields` never reaches (same reason as `generic.*`'s
    // own block clears, just above). Mirrors `MapOfListsField`/`ObjectListField`'s own gating exactly:
    // the card is blocked while `secretRefUsers` finds a user. A row is only its own action while the
    // group has more than one item — `ObjectListField.remove` deletes the whole group (the same op as
    // the card, `field.path` not `[...field.path, i]`) once only one item is left, per
    // `removeDisabled = lastLocked || (items.length === 1 && !!removeBlocked)` (`lastLocked` never
    // applies here: `MapOfListsField` never sets `field.locked` on a secretRefs group's list) — so a
    // singleton group's last row is exercised by the card check above, not a second index-based delete
    // (which `secretRefs.<group>`'s own `minItems: 1` would reject even when the group is unblocked).
    if (isObj(values.secretRefs)) {
      for (const [group, items] of Object.entries(values.secretRefs as Record<string, unknown>)) {
        if (!Array.isArray(items)) continue;
        const users = secretRefUsers(values, group);
        const cardPath = ['secretRefs', group];
        if (users.length === 0) {
          const r = render(start.apply([{ op: 'delete', path: cardPath }]).toString());
          if (!r.ok) fails.push(`clear ${base.label} · ${cardPath.join('.')} → ${why(r)}`);
        }
        if (items.length > 1) {
          for (let i = 0; i < items.length; i++) {
            const rowPath = ['secretRefs', group, i];
            const r = render(start.apply([{ op: 'delete', path: rowPath }]).toString());
            if (!r.ok) fails.push(`clear ${base.label} · ${rowPath.join('.')} → ${why(r)}`);
          }
        }
      }
    }
    for (const panel of panelsOf(start)) {
      for (const f of walkFields(panel.node, panel.path, start.valueAt(panel.path), panel.hide, lockedPaths)) {
        const id = `${base.label} · ${f.path.join('.')}`;
        if (!f.present) {
          const value = chipValue(root, f);
          // matches AddChips' own onClick: an absent member of an "exactly one of" group carries
          // `evict` ops for whichever sibling is currently set (PdbConfig, EnvVar's valueFrom) —
          // applying only the `set` half would leave the document matching two oneOf/anyOf branches.
          const r = render(start.apply([{ op: 'set', path: f.path, value }, ...f.evict]).toString());
          if (!r.ok) fails.push(`chip ${id} = ${JSON.stringify(value)} → ${why(r)}`);
        } else if (!f.locked) {
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
    bases.push(genericBase(false), genericBase(true), secretRefsBase());
    sweep(bases, fails);
    expect(fails).toEqual([]);
  }, TIMEOUT);

  // `lockedPaths` self-check: `genericBase(true)` is the one base where the `subdomainUsers` lock is
  // actually live (a `hosts[].subdomain` exists in the document), so this is the one place able to
  // prove the lock still does something. Without this, a change that quietly makes
  // `generic.ingressesGeneral` renderable-when-cleared even with a live subdomain reference would pass
  // the sweep above by skipping the path via `lockedPaths` — flagged here instead of silently unchecked.
  it.skipIf(SKIP)('the subdomain lock on generic.ingressesGeneral is still load-bearing', () => {
    const { text } = genericBase(true);
    const start = ValuesDocument.parse(text);
    const r = render(start.apply([{ op: 'delete', path: ['generic', 'ingressesGeneral'] }]).toString());
    expect(r.ok, 'clearing generic.ingressesGeneral while a subdomain reference exists should fail to render — the lock is no longer load-bearing').toBe(false);
  }, TIMEOUT);

  // vitest 5.0.0's ChainableTestAPI type does not re-expose `.runIf` after `.skipIf` (see the same
  // note in test/edit-integrity.test.ts), so this is the equivalent single condition.
  it.skipIf(SKIP || !FULL)('every Add chip and every clear renders on the shipped examples', () => {
    const fails: string[] = [];
    sweep(examples.map((e) => ({ label: e.id, text: e.values })), fails);
    expect(fails).toEqual([]);
  }, TIMEOUT);
});
