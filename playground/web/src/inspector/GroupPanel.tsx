import { useEffect, useRef, type ReactElement } from 'react';
import type { EditOp, ValuesDocument } from '../model/ValuesDocument';
import type { SecondaryId } from '../graph/secondary';
import { schemaAt, type SchemaNode } from './schema';
import { KindIcon } from '../canvas/icons';
import { AutoCreated } from './AutoCreated';
import { workloadSummary } from './summary';
import type { InspectTarget } from './target';
import { isObj } from '../model/guards';

/** spec 2026-09-08 §3.1: the workload row and the "Created alongside it" switch list. */
export function GroupPanel(p: {
  target: Extract<InspectTarget, { kind: 'group' }>; root: SchemaNode; doc: ValuesDocument; disabled: boolean;
  onEdit: (ops: EditOp[]) => void; onSelect: (selection: string) => void; focusToken: number;
}): ReactElement {
  const { owner, members } = p.target;
  const base = owner.provenance!.path;
  const kindKey = String(base[0]), name = String(base[1]);
  const raw = p.doc.valueAt(base);
  const cfg = isObj(raw) ? raw : {};
  const nodeFor = (id: SecondaryId) => members.find((m) => m.provenance && m.provenance.path.length === 3 && String(m.provenance.path[2]) === id)?.id ?? null;
  const created = useRef<HTMLDivElement>(null);
  // "+ Add resource" on the canvas: scroll the list into view and focus its first switch (spec §2.2)
  useEffect(() => {
    if (p.focusToken > 0 && created.current) {
      created.current.scrollIntoView?.({ block: 'start' });
      (created.current.querySelector('input[role="switch"]') as HTMLElement | null)?.focus();
    }
  }, [p.focusToken]);
  return (
    <fieldset disabled={p.disabled}>
      <div className="sec">
        <h3>Workload</h3>
        <div className="list">
          <div className="it on">
            <span className={`tile sm fam-${owner.family}`}><KindIcon kind={owner.kind} /></span>
            <div className="txt"><div className="nm">{owner.kind}</div><div className="sub">{workloadSummary(kindKey, cfg)}</div></div>
            <button type="button" className="link" aria-label={`open ${owner.kind}`} onClick={() => p.onSelect(owner.id)}>Open</button>
            <span />
          </div>
        </div>
      </div>
      <div className="sec" ref={created}>
        <h3>Created alongside it</h3>
        <AutoCreated kindKey={kindKey} name={name} base={base} cfg={cfg} disabled={p.disabled} onEdit={p.onEdit}
          nodeFor={nodeFor} hasSchema={(id) => !!schemaAt(p.root, [...base, id])} onSelect={p.onSelect} />
      </div>
    </fieldset>
  );
}
