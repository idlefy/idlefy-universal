import { useEffect } from 'react';

const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

/** True when a key press on this target is text entry (Monaco's textarea proxy, the examples <select> type-ahead, editable regions). */
export function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof Element && t.closest(TYPING) !== null;
}

/**
 * A bare single-key shortcut (spec §3 hotkey guard). React Flow binds no letter keys, so the canvas
 * itself is safe. `shiftKey` counts as a modifier — a capital `A` is someone typing — and a key
 * press that merely commits an IME composition is never a shortcut.
 */
export function useHotkey(key: string, handler: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.isComposing) return;
      if (e.key.toLowerCase() !== key) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, handler, enabled]);
}
