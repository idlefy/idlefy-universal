import type { ReactElement } from 'react';
import type { GraphNode } from '../graph/types';
import type { EditOp, ValuesDocument } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { groupId } from '../app/selection';
import { isWorkloadNode } from '../canvas/groups';
import { schemaAt, type SchemaNode } from './schema';
import { FieldList } from './fields';
import { Sections } from './Sections';
import { OwnerStrip } from './OwnerStrip';
import { secondaryById, type InspectTarget } from './target';
import { SECONDARY_SECTIONS, SERVICE_OWNER_KEYS, KIND_LABEL } from './sections';
import { isObj, samePath } from '../model/guards';

/** spec 2026-09-08 §3.3 / §3.3.1 / §3.5: one auto-created resource, with or without a rendered node. */
export function SecondaryPanel(p: {
  target: Extract<InspectTarget, { kind: 'secondary' }>; root: SchemaNode; doc: ValuesDocument; tier: Tier; nodes: GraphNode[]; disabled: boolean;
  onEdit: (ops: EditOp[]) => void; onSelect: (selection: string) => void; onTier: (t: Tier) => void;
}): ReactElement {
  const { owner, secondary, path } = p.target;
  const sec = secondaryById(secondary);
  const kindKey = String(owner[0]), name = String(owner[1]);
  const ownerNode = p.nodes.find((n) => isWorkloadNode(n) && samePath(n.provenance!.path, owner)) ?? null;
  const ownerKind = ownerNode?.kind ?? KIND_LABEL[kindKey] ?? kindKey;
  const raw = p.doc.valueAt(owner);
  const cfg = isObj(raw) ? raw : {};
  const on = sec.isOn(cfg);
  const blocked = sec.blocked?.(cfg, kindKey);
  // secondary.ts: some `off()` handlers delete the block, others only clear a flag — say which (spec §3.3)
  const deletes = sec.off(owner).some((o) => o.op === 'delete');
  const toggle = (checked: boolean) => {
    if (checked) { p.onEdit(sec.on(owner, cfg, name)); return; }
    p.onEdit(sec.off(owner));
    // the node (and with it this panel's subject) may vanish: hand the selection to the group
    if (ownerNode) p.onSelect(groupId(ownerNode.id));
  };
  const goOwner = ownerNode ? () => p.onSelect(ownerNode.id) : undefined;

  let fields: ReactElement | null = null;
  if (secondary === 'service') {
    const keys = SERVICE_OWNER_KEYS[kindKey] ?? [];
    const ownerSchema = schemaAt(p.root, owner)!;
    const ports = Object.entries(cfg.containers ?? {}).flatMap(([cn, c]: [string, any]) =>
      Object.entries(isObj(c?.ports) ? c.ports : {}).map(([pn, pt]: [string, any]) => ({
        id: `${cn}/${pn}`, name: pn, container: pt?.containerPort, service: pt?.servicePort ?? pt?.containerPort, protocol: pt?.protocol ?? 'TCP',
      })));
    fields = (
      <>
        {keys.length > 0 && (
          <div className="sec">
            <h3>Service</h3>
            <FieldList root={p.root} node={ownerSchema} basePath={owner} value={cfg} tier="advanced" onEdit={p.onEdit} hide={(k) => !keys.includes(k)} order={keys} />
          </div>
        )}
        <div className="sec">
          <h3>Ports</h3>
          {ports.length > 0 ? (
            <div className="fields">
              {ports.map((pt) => (
                <div key={pt.id} className="field inline">
                  <div className="field-head"><label data-key={pt.name}>{pt.name}</label></div>
                  <code>{pt.container} → {pt.service}/{pt.protocol}</code>
                </div>
              ))}
            </div>
          ) : <p className="muted">No container ports yet.</p>}
          <div className="add"><button type="button" className="link" aria-label="edit ports on owner" onClick={goOwner}>Open {ownerKind}</button></div>
        </div>
      </>
    );
  } else {
    const node = schemaAt(p.root, path);
    const tables = SECONDARY_SECTIONS[secondary];
    if (node) fields = (
      <Sections root={p.root} node={node} base={path} value={p.doc.valueAt(path)} tier={p.tier} tables={tables ?? []}
        other={tables ? undefined : { id: 'main', title: sec.label, keys: [] }}
        hide={(k) => secondary === 'migrations' && k === 'enabled'}   // the enabled row owns this key
        onEdit={p.onEdit} onTier={p.onTier} />
    );
  }

  return (
    <>
      <OwnerStrip kind={ownerKind} text={<>Created for {ownerKind} <b>{name}</b></>} button="Open" ariaLabel="open owner" onClick={goOwner} />
      <div className="enabled">
        <div>
          <div className="nm">{sec.label} enabled</div>
          <div className={`sub ${blocked ? 'why' : ''}`}>{blocked ?? (deletes ? 'turning off removes its settings from values.yaml' : 'turning off keeps the settings in values.yaml')}</div>
        </div>
        <input type="checkbox" role="switch" className="switch" aria-label={`toggle ${sec.label}`} checked={on} disabled={p.disabled || (!on && !!blocked)} onChange={(e) => toggle(e.target.checked)} />
      </div>
      <fieldset disabled={p.disabled}>{fields}</fieldset>
    </>
  );
}
