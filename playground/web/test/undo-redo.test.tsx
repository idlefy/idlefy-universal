// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { useRef } from 'react';
import { useUndoRedo } from '../src/app/useUndoRedo';
import type { EditorApi } from '../src/editor/Editor';

afterEach(cleanup);
function Host(p: { api: EditorApi }) {
  const ref = useRef<EditorApi | null>(p.api);
  useUndoRedo(ref);
  return <div><input aria-label="i" /><button>b</button></div>;
}

describe('useUndoRedo', () => {
  it('routes Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z to the editor and prevents the default', () => {
    const api = { undo: vi.fn(), redo: vi.fn() };
    render(<Host api={api} />);
    const ev = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    expect(api.undo).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    expect(api.undo).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(api.redo).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true, shiftKey: true });
    expect(api.redo).toHaveBeenCalledTimes(2);
  });
  it('leaves text fields (Monaco included) to their own undo, and ignores a bare or alt-ed z', () => {
    const api = { undo: vi.fn(), redo: vi.fn() };
    const { getByLabelText } = render(<Host api={api} />);
    fireEvent.keyDown(getByLabelText('i'), { key: 'z', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'z' });
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, altKey: true });
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(api.undo).not.toHaveBeenCalled();
    expect(api.redo).not.toHaveBeenCalled();
  });
});
