import type { ReactElement, ReactNode } from 'react';
import type { EditOp, ValuesPath } from '../model/ValuesDocument';
import { secondariesFor, type SecondaryId } from '../graph/secondary';
import { KindIcon } from '../canvas/icons';
import { ORDER, kindOfSecondary, hintOf, summaryOf } from './summary';
import { familyOf } from '../graph/labels';

/** Switch list of the resources the chart can auto-create for this workload (spec 2026-09-07 §5.4). */
export function AutoCreated(p: {
  kindKey: string; name: string; base: ValuesPath; cfg: Record<string, any>; disabled: boolean; highlight?: SecondaryId;
  onEdit: (ops: EditOp[]) => void; nodeFor: (id: SecondaryId) => string | null; onSelect: (nodeId: string) => void;
  renderBlock?: (id: SecondaryId) => ReactNode;
}): ReactElement | null {
  const byId = new Map(secondariesFor(p.kindKey).map((s) => [s.id, s]));
  const list = ORDER.map((id) => byId.get(id)!).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <div className="list">
      {list.map((s) => {
        const on = s.isOn(p.cfg);
        const blocked = s.blocked?.(p.cfg, p.kindKey);
        const kind = kindOfSecondary(s.id);
        const target = on ? p.nodeFor(s.id) : null;
        return (
          <div key={s.id} className={`it ${s.id === p.highlight ? 'highlight' : ''}`}>
            <input type="checkbox" role="switch" className="switch" aria-label={`toggle ${s.label}`} checked={on} disabled={p.disabled || (!on && !!blocked)}
              onChange={(e) => p.onEdit(e.target.checked ? s.on(p.base, p.cfg, p.name) : s.off(p.base))} />
            <div>
              <div className="nm"><KindIcon kind={kind} className={`fam-${familyOf(kind)}`} />{s.label}</div>
              <div className={`sub ${blocked ? 'why' : ''}`}>{blocked ?? (on ? summaryOf(s.id, p.cfg) : hintOf(s.id))}</div>
            </div>
            {target ? <button type="button" className="go" aria-label={`open ${s.label}`} onClick={() => p.onSelect(target)}>open ›</button> : <span />}
            {on && !target && p.renderBlock && <div className="inline-block">{p.renderBlock(s.id)}</div>}
          </div>
        );
      })}
    </div>
  );
}
