import type { ReactElement } from 'react';
import type { GraphNode } from '../graph/types';
import type { EditOp, ValuesDocument, ValuesPath } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { schemaAt, conditionalHints, type SchemaNode } from './schema';
import { FieldList } from './fields';
import { Toggles } from './Toggles';
import { inspectTarget, secondaryById } from './target';
import type { SecondaryId } from '../graph/secondary';

// spec §4.5/§4.9: the release node edits release-level settings only — entity maps are palette territory.
const RELEASE_SECTIONS = ['generic', 'deploymentsGeneral', 'statefulSetsGeneral', 'daemonSetsGeneral', 'secretRefs'];
const KIND_LABEL: Record<string, string> = { deployments: 'Deployment', statefulSets: 'StatefulSet', daemonSets: 'DaemonSet', jobs: 'Job', cronJobs: 'CronJob' };
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

export function Inspector(p: {
  node: GraphNode; root: SchemaNode; doc: ValuesDocument; tier: Tier;
  onTier: (t: Tier) => void; onEdit: (ops: EditOp[]) => void; disabled: boolean;
}): ReactElement {
  const t = inspectTarget(p.node, p.root);
  const edit = p.disabled ? () => {} : p.onEdit;
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
    return (
      <>
        <Toggles kindKey={kindKey} name={name} base={base} cfg={isObj(cfg) ? cfg : {}} disabled={p.disabled} highlight={highlight} onEdit={edit} />
        <ul className="hints">{conditionalHints(p.root, node).map((h) => <li key={h}>{h}</li>)}</ul>
        <fieldset disabled={p.disabled}>
          <FieldList root={p.root} node={node} basePath={base} value={cfg} tier={p.tier} onEdit={edit} hide={(k) => k.startsWith('autoCreate')} />
        </fieldset>
      </>
    );
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
              <FieldList root={p.root} node={p.root.properties[k]} basePath={[k]} value={p.doc.valueAt([k])} tier={p.tier} onEdit={edit} />
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
    }
  }
  return (
    <div className="inspector">
      {tierBar}
      {notice}
      {body}
    </div>
  );
}
