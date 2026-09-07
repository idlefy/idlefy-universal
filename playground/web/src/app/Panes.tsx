import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { PANE_LIMITS, clampWidth, loadPanes, savePanes, type PaneId, type PanesState } from './panes';

const storage = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

export function usePanes() {
  const [panes, setPanes] = useState<PanesState>(() => loadPanes(storage()));
  useEffect(() => { savePanes(storage(), panes); }, [panes]);
  const setOpen = useCallback((id: PaneId, open: boolean) => setPanes((s) => (s[id].open === open ? s : { ...s, [id]: { ...s[id], open } })), []);
  const setWidth = useCallback((id: PaneId, width: number) => setPanes((s) => ({ ...s, [id]: { ...s[id], width: clampWidth(id, width) } })), []);
  const reset = useCallback((id: PaneId) => setPanes((s) => ({ ...s, [id]: { ...s[id], width: PANE_LIMITS[id].default } })), []);
  return { panes, setOpen, setWidth, reset };
}

/** 7 px drag strip between panes. `onDrag` receives the pointer delta since drag start (positive = right). */
export function SplitHandle({ label, disabled, onDrag, onReset }: { label: string; disabled: boolean; onDrag: (dx: number) => void; onReset: () => void }): ReactElement {
  const [active, setActive] = useState(false);
  const x0 = useRef(0);
  return (
    <div
      className={`handle ${disabled ? 'off' : ''} ${active ? 'on' : ''}`}
      role="separator" aria-orientation="vertical" aria-label={label} aria-disabled={disabled || undefined}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        e.preventDefault(); x0.current = e.clientX; setActive(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => { if (active) onDrag(e.clientX - x0.current); }}
      onPointerUp={() => setActive(false)}
      onPointerCancel={() => setActive(false)}
      onDoubleClick={() => { if (!disabled) onReset(); }}
    />
  );
}

/** 30 px collapsed pane: vertical label + chevron, click reopens. */
export function Rail({ label, name, side, icon, onOpen }: { label: string; name: string; side: 'left' | 'right'; icon?: ReactNode; onOpen: () => void }): ReactElement {
  return (
    <button type="button" className={`rail rail-${side}`} onClick={onOpen} aria-label={`Show ${name}`} title={label}>
      <span className="rail-arrow" aria-hidden="true">{side === 'left' ? '›' : '‹'}</span>
      {icon}
      <span className="rail-text" aria-hidden="true">{label}</span>
    </button>
  );
}
