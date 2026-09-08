import type { ReactElement } from 'react';

/** Footer naming the advanced sections the basic tier hides (spec 2026-09-08 §4.6). Nothing renders when nothing is hidden. */
export function HiddenNote({ names, onShow }: { names: string[]; onShow: () => void }): ReactElement | null {
  if (names.length === 0) return null;
  return (
    <div className="hidden-note">
      <span>{names.join(', ')} hidden</span>
      <button type="button" className="link" aria-label="show hidden sections" onClick={onShow}>Show all fields</button>
    </div>
  );
}
