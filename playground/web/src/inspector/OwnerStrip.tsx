import type { ReactElement, ReactNode } from 'react';
import { KindIcon, GroupGlyph } from '../canvas/icons';
import { familyOf } from '../graph/labels';

/** The strip above a panel that names what the object belongs to. `kind: 'group'` draws the group glyph. */
export function OwnerStrip(p: { kind: string; text: ReactNode; button: string; ariaLabel: string; onClick?: () => void }): ReactElement {
  const fam = p.kind === 'group' ? 'workload' : familyOf(p.kind);
  return (
    <div className="owner">
      <span className={`tile sm fam-${fam}`}>{p.kind === 'group' ? <GroupGlyph /> : <KindIcon kind={p.kind} />}</span>
      <span className="txt">{p.text}</span>
      {p.onClick && <button type="button" className="link" aria-label={p.ariaLabel} onClick={p.onClick}>{p.button}</button>}
    </div>
  );
}
