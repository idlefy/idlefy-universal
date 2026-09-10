import type { ReactElement } from 'react';
import type { EditOp, ValuesPath } from '../model/ValuesDocument';
import { secondariesFor, toggleState, type SecondaryId } from '../graph/secondary';
import { KindIcon } from '../canvas/icons';
import { summaryOf } from './summary';
import { familyOf } from '../graph/labels';
import { blockId } from '../app/selection';
import { isFilledObj } from '../model/guards';

/** Switch list of the resources the chart can auto-create for a workload. Never renders a block inline. */
export function AutoCreated(p: {
  kindKey: string; name: string; base: ValuesPath; cfg: Record<string, any>; disabled: boolean;
  onEdit: (ops: EditOp[]) => void; nodeFor: (id: SecondaryId) => string | null; hasSchema: (id: SecondaryId) => boolean; onSelect: (selection: string) => void;
}): ReactElement | null {
  const list = secondariesFor(p.kindKey);
  if (list.length === 0) return null;
  return (
    <div className="list">
      {list.map((s) => {
        const { on, why, isDisabled: disabledByToggle } = toggleState(s, p.cfg, p.kindKey, false);
        const kind = s.kind;
        const node = on ? p.nodeFor(s.id) : null;
        const configured = !on && isFilledObj(p.cfg[s.id]);
        // a rendered node opens itself; a block with a schema node opens as `block:<path>` when the
        // secondary is on or already has a body — off + empty means the switch is the only affordance,
        // since opening an off block whose autoCreate* flag is false fails the chart on any edit
        const target = node ?? (p.hasSchema(s.id) && (on || configured) ? blockId([...p.base, s.id]) : null);
        const sub = why ?? (on ? summaryOf(s.id, p.cfg) : configured ? 'configured, not created' : s.hint);
        const isDisabled = p.disabled || disabledByToggle;
        return (
          <div key={s.id} className={`it ${on ? 'on' : ''}`}>
            <span className={`tile sm fam-${familyOf(kind)}`}><KindIcon kind={kind} /></span>
            <div className="txt">
              <div className="nm">{s.label}</div>
              <div className={`sub ${why ? 'why' : ''}`}>{sub}</div>
            </div>
            {target ? <button type="button" className="link" aria-label={`open ${s.label}`} onClick={() => p.onSelect(target)}>Open</button> : <span />}
            {/* jsdom fires the native `change` event for a disabled checkbox when the click is
                dispatched programmatically (only the real `.click()` method honors `disabled`), so
                guard here too rather than trusting the DOM attribute alone. */}
            <input type="checkbox" role="switch" className="switch" aria-label={`toggle ${s.label}`} checked={on} disabled={isDisabled}
              onChange={(e) => { if (isDisabled) return; p.onEdit(e.target.checked ? s.on(p.base, p.cfg, p.name) : s.off(p.base)); }} />
          </div>
        );
      })}
    </div>
  );
}
