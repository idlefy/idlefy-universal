import type { ReactElement } from 'react';
import type { EditOp, ValuesPath } from '../model/ValuesDocument';
import { secondariesFor, type SecondaryId } from '../graph/secondary';

/** Checkbox per secondary resource the chart can auto-create for this workload kind. Resources the
 *  chart never renders for the kind are absent from `secondariesFor`, so they are hidden, not disabled. */
export function Toggles(p: {
  kindKey: string; name: string; base: ValuesPath; cfg: Record<string, any>;
  disabled: boolean; highlight?: SecondaryId; onEdit: (ops: EditOp[]) => void;
}): ReactElement | null {
  const list = secondariesFor(p.kindKey);
  if (list.length === 0) return null;
  return (
    <section className="toggles">
      <h4>Secondary resources</h4>
      {list.map((s) => {
        const on = s.isOn(p.cfg);
        const blocked = !on && s.blocked?.(p.cfg, p.kindKey);
        return (
          <label key={s.id} className={`toggle ${s.id === p.highlight ? 'highlight' : ''}`} title={blocked || undefined}>
            <input type="checkbox" aria-label={`toggle ${s.label}`} checked={on} disabled={p.disabled || !!blocked}
              onChange={(e) => p.onEdit(e.target.checked ? s.on(p.base, p.cfg, p.name) : s.off(p.base))} />
            <span>{s.label}</span>
            {blocked && <span className="field-err">{blocked}</span>}
          </label>
        );
      })}
    </section>
  );
}
