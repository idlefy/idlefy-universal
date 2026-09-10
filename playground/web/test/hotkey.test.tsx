// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { useHotkey, isTypingTarget } from '../src/palette/useHotkey';

afterEach(cleanup);
function Host(p: { on: () => void; enabled?: boolean }) { useHotkey('a', p.on, p.enabled); return <div><input aria-label="i" /><select aria-label="s"><option>x</option></select><div contentEditable="true" data-testid="ce" /><div role="textbox" data-testid="tb" /><button>b</button></div>; }

describe('useHotkey', () => {
  it('fires on a bare key press outside inputs, in either case, and prevents default', () => {
    const on = vi.fn();
    render(<Host on={on} />);
    const ev = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    expect(on).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    fireEvent.keyDown(document.body, { key: 'A' });
    expect(on).toHaveBeenCalledTimes(2);
  });
  it('ignores modifiers, other keys, typing targets, and disabled', () => {
    const on = vi.fn();
    const { getByLabelText, getByTestId, rerender } = render(<Host on={on} />);
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'a', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'a', altKey: true });
    fireEvent.keyDown(document.body, { key: 'A', shiftKey: true });   // a capital A is typing, not a shortcut
    fireEvent.keyDown(document.body, { key: 'a', isComposing: true }); // an IME commit, not a shortcut
    fireEvent.keyDown(document.body, { key: 'b' });
    fireEvent.keyDown(getByLabelText('i'), { key: 'a' });
    fireEvent.keyDown(getByLabelText('s'), { key: 'a' });
    fireEvent.keyDown(getByTestId('ce'), { key: 'a' });
    fireEvent.keyDown(getByTestId('tb'), { key: 'a' });
    expect(on).not.toHaveBeenCalled();
    rerender(<Host on={on} enabled={false} />);
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(on).not.toHaveBeenCalled();
    rerender(<Host on={on} enabled />);
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(on).toHaveBeenCalledTimes(1);
  });
  it('isTypingTarget walks up to a typing ancestor', () => {
    const wrap = document.createElement('div'); wrap.setAttribute('role', 'textbox');
    const inner = document.createElement('span'); wrap.appendChild(inner);
    expect(isTypingTarget(inner)).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
