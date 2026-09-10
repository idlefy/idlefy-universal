import { useEffect, type RefObject } from 'react';
import { isTypingTarget } from '../palette/useHotkey';
import type { EditorApi } from '../editor/Editor';

/**
 * Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z anywhere outside a text field drive Monaco's undo stack — the one
 * history the whole app writes to (Editor pushes inspector and palette edits onto it rather than
 * calling setValue). Without this the only undo is unreachable: the values.yaml pane is collapsed by
 * default. Inside Monaco or any other input the native handler already wins, so we stay out.
 */
export function useUndoRedo(api: RefObject<EditorApi | null>): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key.toLowerCase() !== 'z') return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) api.current?.redo();
      else api.current?.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api]);
}
