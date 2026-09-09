import type { ReactElement } from 'react';
import type { GraphNode } from '../graph/types';
import type { EditOp, ValuesDocument } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import type { ResolvedSelection } from '../app/selection';
import { schemaAt, type SchemaNode } from './schema';
import { FieldList } from './fields';
import { inspectTarget, type InspectTarget } from './target';
import { WORKLOAD_KINDS } from '../graph/secondary';
import { WorkloadPanel } from './WorkloadPanel';
import { ReleasePanel } from './ReleasePanel';
import { GroupPanel } from './GroupPanel';
import { SecondaryPanel } from './SecondaryPanel';

type InspectorProps = {
  sel: ResolvedSelection; root: SchemaNode; doc: ValuesDocument; tier: Tier; nodes: GraphNode[];
  onEdit: (ops: EditOp[]) => void; onSelect: (selection: string) => void; onTier: (t: Tier) => void; disabled: boolean; focusToken: number;
};

export const DISABLED_NOTICE = 'Fix the YAML syntax error in the editor to edit here.';

export function Inspector(p: InspectorProps): ReactElement {
  const t: InspectTarget = inspectTarget(p.sel, p.root);
  const edit = p.disabled ? () => {} : p.onEdit;
  const notice = p.disabled && <p className="banner-inline">{DISABLED_NOTICE}</p>;

  let body: ReactElement;
  switch (t.kind) {
    case 'none': body = <p className="muted prov">{t.reason}</p>; break;
    case 'release': body = <ReleasePanel target={t} root={p.root} doc={p.doc} tier={p.tier} disabled={p.disabled} onEdit={edit} onTier={p.onTier} />; break;
    case 'workload': body = <WorkloadPanel target={t} root={p.root} doc={p.doc} tier={p.tier} nodes={p.nodes} disabled={p.disabled} onEdit={edit} onSelect={p.onSelect} onTier={p.onTier} />; break;
    case 'group': body = <GroupPanel target={t} root={p.root} doc={p.doc} disabled={p.disabled} onEdit={edit} onSelect={p.onSelect} focusToken={p.focusToken} />; break;
    case 'secondary': body = <SecondaryPanel target={t} root={p.root} doc={p.doc} tier={p.tier} nodes={p.nodes} disabled={p.disabled} onEdit={edit} onSelect={p.onSelect} onTier={p.onTier} />; break;
    case 'entity': {
      body = (
        <>
          {t.owner && <p className="prov">Part of {WORKLOAD_KINDS[String(t.owner[0])]} {String(t.owner[1])} (values: <code>{t.path.join('.')}</code>).</p>}
          <fieldset disabled={p.disabled}>
            <div className="sec">
              <FieldList root={p.root} node={schemaAt(p.root, t.path)!} basePath={t.path} value={p.doc.valueAt(t.path)} tier={p.tier} onEdit={edit} />
            </div>
          </fieldset>
        </>
      );
      break;
    }
  }
  const bodyKey = t.kind === 'release' ? 'release' : t.kind === 'none' ? 'none' : t.kind === 'group' ? `group:${t.owner.id}` : t.path.join('.');
  return (
    <div className="inspector" key={bodyKey}>
      {notice}
      {body}
    </div>
  );
}
