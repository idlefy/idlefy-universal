import { useEffect, type RefObject } from 'react';
import { isTypingTarget } from '../palette/useHotkey';
import type { EditorApi } from '../editor/Editor';

/**
 * Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl/Cmd+Y (Monaco's own primary redo binding on Windows/Linux,
 * with no Shift) anywhere outside a text field drive Monaco's undo stack — the one history the whole
 * app writes to (Editor pushes inspector and palette edits onto it rather than calling setValue).
 * Without this the only undo is unreachable: the values.yaml pane is collapsed by default. Inside
 * Monaco or any other input the native handler already wins, so we stay out.
 */
export function useUndoRedo(api: RefObject<EditorApi | null>, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.isComposing) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndo && !isRedo) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (isRedo) api.current?.redo();
      else api.current?.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api, enabled]);
}
