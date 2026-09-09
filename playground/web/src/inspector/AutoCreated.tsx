import type { ReactElement } from 'react';
import type { EditOp, ValuesPath } from '../model/ValuesDocument';
import { secondariesFor, type SecondaryId } from '../graph/secondary';
import { KindIcon } from '../canvas/icons';
import { summaryOf } from './summary';
import { familyOf } from '../graph/labels';
import { blockId } from '../app/selection';
import { isFilledObj } from '../model/guards';

/** Switch list of the resources the chart can auto-create for a workload (spec 2026-09-08 §3.1). Never renders a block inline. */
export function AutoCreated(p: {
  kindKey: string; name: string; base: ValuesPath; cfg: Record<string, any>; disabled: boolean;
  onEdit: (ops: EditOp[]) => void; nodeFor: (id: SecondaryId) => string | null; hasSchema: (id: SecondaryId) => boolean; onSelect: (selection: string) => void;
}): ReactElement | null {
  const list = secondariesFor(p.kindKey);
  if (list.length === 0) return null;
  return (
    <div className="list">
      {list.map((s) => {
        const on = s.isOn(p.cfg);
        const blocked = s.blocked?.(p.cfg, p.kindKey);
        const kind = s.kind;
        const node = on ? p.nodeFor(s.id) : null;
        // a rendered node opens itself; a block with a schema node opens as `block:<path>` even without a node
        const target = node ?? (p.hasSchema(s.id) ? blockId([...p.base, s.id]) : null);
        const configured = !on && isFilledObj(p.cfg[s.id]);
        const sub = blocked ?? (on ? summaryOf(s.id, p.cfg) : configured ? 'configured, not created' : s.hint);
        return (
          <div key={s.id} className={`it ${on ? 'on' : ''}`}>
            <span className={`tile sm fam-${familyOf(kind)}`}><KindIcon kind={kind} /></span>
            <div className="txt">
              <div className="nm">{s.label}</div>
              <div className={`sub ${blocked ? 'why' : ''}`}>{sub}</div>
            </div>
            {target ? <button type="button" className="go" aria-label={`open ${s.label}`} onClick={() => p.onSelect(target)}>Open</button> : <span />}
            <input type="checkbox" role="switch" className="switch" aria-label={`toggle ${s.label}`} checked={on} disabled={p.disabled || (!on && !!blocked)}
              onChange={(e) => p.onEdit(e.target.checked ? s.on(p.base, p.cfg, p.name) : s.off(p.base))} />
          </div>
        );
      })}
    </div>
  );
}
