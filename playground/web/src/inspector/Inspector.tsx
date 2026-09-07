import type { ReactElement } from 'react';
import type { GraphNode } from '../graph/types';
import type { EditOp, ValuesDocument, ValuesPath } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { schemaAt, classify, resolve, conditionalHints, type SchemaNode } from './schema';
import type { Field } from './form';
import { FieldList, FieldRow } from './fields';
import { Toggles } from './Toggles';
import { inspectTarget, secondaryById } from './target';
import { SECONDARY, secondariesFor, type SecondaryId } from '../graph/secondary';

// spec §4.5/§4.9: the release node edits release-level settings only — entity maps are palette territory.
const RELEASE_SECTIONS = ['generic', 'deploymentsGeneral', 'statefulSetsGeneral', 'daemonSetsGeneral', 'secretRefs'];
const KIND_LABEL: Record<string, string> = { deployments: 'Deployment', statefulSets: 'StatefulSet', daemonSets: 'DaemonSet', jobs: 'Job', cronJobs: 'CronJob' };
// autoCreate* flags the toggle table owns; every other autoCreate* flag (autoCreateSoftAntiAffinity)
// has no toggle and must stay reachable as an ordinary field.
const OWNED_FLAGS = new Set(SECONDARY.map((s) => `autoCreate${s.id[0].toUpperCase()}${s.id.slice(1)}`));
// Secondary ids double as the config block keys (ingress, hpa, pdb, …). StatefulSetSpec/DaemonSetSpec
// still declare blocks the chart only renders for deployments (spec §2.2); editing those is a no-op,
// so a block is offered only when the toggle table lists it for the kind.
const ALL_BLOCKS = new Set<string>(SECONDARY.map((s) => s.id));
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

export function Inspector(p: {
  node: GraphNode; root: SchemaNode; doc: ValuesDocument; tier: Tier;
  onTier: (t: Tier) => void; onEdit: (ops: EditOp[]) => void; disabled: boolean;
}): ReactElement {
  const t = inspectTarget(p.node, p.root);
  const edit = p.disabled ? () => {} : p.onEdit;
  const rootValue = p.doc.valueAt([]);
  const all = (isObj(rootValue) ? rootValue : {}) as Record<string, unknown>;
  const tierBar = (
    <div className="tier" role="radiogroup" aria-label="tier">
      {(['basic', 'advanced'] as Tier[]).map((x) => (
        <label key={x}>
          <input type="radio" name="tier" aria-label={x === 'basic' ? 'Basic' : 'Advanced'} checked={p.tier === x} onChange={() => p.onTier(x)} />
          {x === 'basic' ? 'Basic' : 'Advanced'}
        </label>
      ))}
    </div>
  );
  const notice = p.disabled && <p className="banner-inline">Fix the YAML syntax error in the editor to edit here.</p>;

  const workloadPanel = (base: ValuesPath, highlight?: SecondaryId) => {
    const kindKey = String(base[0]), name = String(base[1]);
    const cfg = p.doc.valueAt(base);
    const node = schemaAt(p.root, base)!;
    const applicable = new Set<string>(secondariesFor(kindKey).map((s) => s.id));
    const hide = (k: string) => OWNED_FLAGS.has(k) || (ALL_BLOCKS.has(k) && !applicable.has(k));
    return (
      <>
        <Toggles kindKey={kindKey} name={name} base={base} cfg={isObj(cfg) ? cfg : {}} disabled={p.disabled} highlight={highlight} onEdit={edit} />
        <ul className="hints">{conditionalHints(p.root, node).map((h) => <li key={h}>{h}</li>)}</ul>
        <fieldset disabled={p.disabled}>
          <FieldList root={p.root} node={node} basePath={base} value={cfg} tier={p.tier} onEdit={edit} hide={hide} />
        </fieldset>
      </>
    );
  };

  // Most release sections are property-shaped and list their fields; `secretRefs` is a bare
  // additionalProperties map that buildFields cannot walk, so it is rendered through its own widget.
  const releaseSection = (k: string): ReactElement => {
    const node = resolve(p.root, p.root.properties[k]);
    const widget = classify(p.root, node);
    // _defaults.tpl copies only content keys from <kind>General onto instances, never the autoCreate*
    // flags (see expectations.ts), so those checkboxes would edit values the chart ignores.
    if (widget.kind === 'object') return <FieldList root={p.root} node={node} basePath={[k]} value={all[k]} tier={p.tier} onEdit={edit} hide={(x) => OWNED_FLAGS.has(x)} />;
    const field: Field = {
      key: k, path: [k], label: k, description: typeof node.description === 'string' ? node.description.trim() : undefined,
      widget, schema: node, value: all[k], present: all[k] !== undefined, required: false,
      tier: node['x-ui-tier'] === 'basic' ? 'basic' : 'advanced',
    };
    return <FieldRow root={p.root} field={field} tier={p.tier} onEdit={edit} />;
  };

  let body: ReactElement; // @types/react 19 has no global JSX namespace
  switch (t.kind) {
    case 'none': body = <p className="muted">{t.reason}</p>; break;
    case 'release':
      body = (
        <fieldset disabled={p.disabled}>
          {RELEASE_SECTIONS.map((k) => (
            <details key={k} open={k === 'generic'}>
              <summary>{k}</summary>
              {releaseSection(k)}
            </details>
          ))}
        </fieldset>
      );
      break;
    case 'workload': body = workloadPanel(t.path); break;
    case 'owner-only': {
      const owner = t.owner;
      body = (
        <>
          <p className="prov">Configured on {KIND_LABEL[String(owner[0])] ?? owner[0]} {String(owner[1])} — toggle <b>{secondaryById(t.secondary).label}</b> below.</p>
          {workloadPanel(owner, t.secondary)}
        </>
      );
      break;
    }
    case 'entity': {
      const owner = p.node.provenance?.owner;
      body = (
        <>
          {owner && <p className="prov">Part of {KIND_LABEL[String(owner[0])] ?? owner[0]} {String(owner[1])} (values: <code>{t.path.join('.')}</code>).</p>}
          <fieldset disabled={p.disabled}>
            <FieldList root={p.root} node={schemaAt(p.root, t.path)!} basePath={t.path} value={p.doc.valueAt(t.path)} tier={p.tier} onEdit={edit} />
          </fieldset>
        </>
      );
      break;
    }
  }
  // Widgets keep local drafts (MapSection's new-key box, KeyValueField's), and selecting another node
  // of the same shape renders an identical tree — key the panel on the target so React remounts it.
  const bodyKey = t.kind === 'release' ? 'release' : t.kind === 'none' ? 'none' : t.kind === 'owner-only' ? t.owner.join('.') : t.path.join('.');
  return (
    <div className="inspector" key={bodyKey}>
      {tierBar}
      {notice}
      {body}
    </div>
  );
}
