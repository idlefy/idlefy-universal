import type { ReactElement } from 'react';
import type { GraphNode } from '../graph/types';
import type { EditOp, ValuesDocument } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { groupId } from '../app/selection';
import { isWorkloadNode } from '../graph/groups';
import { schemaAt, type SchemaNode } from './schema';
import { WORKLOAD_SECTIONS } from './sections';
import { Sections } from './Sections';
import { OwnerStrip } from './OwnerStrip';
import type { InspectTarget } from './target';
import { SEC_IDS, OWNED_FLAGS } from '../graph/secondary';
import { isObj, samePath } from '../model/guards';

/** Only the workload's own fields, with the group named above them. */
export function WorkloadPanel(p: {
  target: Extract<InspectTarget, { kind: 'workload' }>; root: SchemaNode; doc: ValuesDocument; tier: Tier; nodes: GraphNode[]; disabled: boolean;
  onEdit: (ops: EditOp[]) => void; onSelect: (selection: string) => void; onTier: (t: Tier) => void;
}): ReactElement {
  const { path: base, name } = p.target;
  const wl = p.nodes.find((n) => isWorkloadNode(n) && samePath(n.provenance!.path, base));
  const cfg = p.doc.valueAt(base);
  // PortsTable needs to know whether the last container port it would remove is load-bearing for an
  // auto-created Service — the workload cfg (`autoCreateService`) is only visible here, not at the
  // port row's own level several FieldList/FieldRow layers down.
  const workload = { kindKey: String(base[0]), autoCreateService: isObj(cfg) && !!cfg.autoCreateService };
  const members = p.nodes.filter((n) => n.provenance?.owner && samePath(n.provenance.owner, base));
  const summary = members.length === 0 ? 'no other resources yet' : members.length === 1 ? members[0].kind : `${members[0].kind}, ${members.length - 1} more`;
  return (
    <>
      <OwnerStrip kind="group" text={<>In group <b>{name}</b> · {summary}</>} button="Open group" ariaLabel="open group" onClick={wl ? () => p.onSelect(groupId(wl.id)) : undefined} />
      <fieldset disabled={p.disabled}>
        <Sections root={p.root} node={schemaAt(p.root, base)!} base={base} value={cfg} tier={p.tier} tables={WORKLOAD_SECTIONS}
          hide={(k) => OWNED_FLAGS.has(k) || SEC_IDS.has(k)} onEdit={p.onEdit} onTier={p.onTier} workload={workload} />
      </fieldset>
    </>
  );
}
