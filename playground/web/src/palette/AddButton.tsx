import { useEffect, useRef, type ReactElement } from 'react';
import type { SchemaNode } from '../inspector/schema';
import { Launcher } from './Launcher';
import { DISABLED_NOTICE } from '../inspector/Inspector';

export type LauncherRequest = { key?: string };   // key → open directly in step 2 for that entity (empty-state card)

/** The canvas's top-left Add trigger and the launcher it owns (spec §3). */
export function AddButton(p: {
  disabled: boolean; open: LauncherRequest | null; onOpen: () => void; onClose: () => void;
  root: SchemaNode; values: Record<string, unknown>; onAdd: (key: string, name: string) => void;
}): ReactElement {
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  // Esc, the toggle and a successful add return focus to the trigger (spec §3); an outside click
  // does not — the user is already on their way somewhere else.
  const close = (refocus = true) => { p.onClose(); if (refocus) btn.current?.focus(); };
  // The effect must subscribe once per open, not once per render, so it reads `close` through a ref.
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    if (!p.open) return;
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) closeRef.current(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [p.open]);
  return (
    <div className="add-wrap" ref={wrap}>
      <button ref={btn} type="button" className="add-btn" disabled={p.disabled} title={p.disabled ? DISABLED_NOTICE : undefined}
        aria-haspopup="dialog" aria-expanded={!!p.open} aria-keyshortcuts="a" onClick={() => (p.open ? close() : p.onOpen())}>
        <span className="plus" aria-hidden="true">＋</span> Add <kbd aria-hidden="true">A</kbd>
      </button>
      {p.open && !p.disabled && <Launcher root={p.root} values={p.values} initialKey={p.open.key} onAdd={(k, n) => { p.onAdd(k, n); close(); }} onClose={close} />}
    </div>
  );
}
