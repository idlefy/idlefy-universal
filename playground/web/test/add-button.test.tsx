// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import schema from '../src/chart-bundle/schema.json';
import { AddButton, type LauncherRequest } from '../src/palette/AddButton';

afterEach(cleanup);
const root = schema as any;
function Host(p: { disabled?: boolean; onAdd: (k: string, n: string) => void; start?: LauncherRequest | null }) {
  const [open, setOpen] = useState<LauncherRequest | null>(p.start ?? null);
  return <div><button>outside</button><AddButton disabled={!!p.disabled} open={open} onOpen={() => setOpen({})} onClose={() => setOpen(null)} root={root} values={{}} onAdd={p.onAdd} /></div>;
}

describe('AddButton', () => {
  it('opens the launcher on click, closes on Esc and returns focus to the button', () => {
    render(<Host onAdd={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /Add/ });
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(screen.getByRole('dialog', { name: 'Add a resource' })).toBeTruthy();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(btn);
  });
  it('toggles closed on a second click, refocusing the button', () => {
    render(<Host onAdd={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /Add/ });
    fireEvent.click(btn);
    expect(screen.getByRole('dialog', { name: 'Add a resource' })).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(btn);
  });
  it('closes on a pointer down outside, not on one inside', () => {
    render(<Host onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    fireEvent.pointerDown(screen.getByLabelText('Search resources'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('a successful add calls onAdd, closes and refocuses the button', () => {
    const onAdd = vi.fn();
    render(<Host onAdd={onAdd} start={{ key: 'jobs' }} />);
    fireEvent.click(screen.getByLabelText('Add Job'));
    expect(onAdd).toHaveBeenCalledWith('jobs', 'db-migration');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Add/ }));
  });
  it('disabled: no launcher, the inspector notice as title', () => {
    render(<Host onAdd={vi.fn()} disabled />);
    const btn = screen.getByRole('button', { name: /Add/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('Fix the YAML syntax error in the editor to edit here.');
    fireEvent.click(btn);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('disabled with the launcher already open: still renders no dialog', () => {
    render(<Host onAdd={vi.fn()} disabled start={{}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('an outside pointer down closes without stealing focus back to the button', () => {
    render(<Host onAdd={vi.fn()} />);
    const outside = screen.getByText('outside');
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    outside.focus();
    fireEvent.pointerDown(outside);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });
  it('announces the hotkey without putting it in the accessible name', () => {
    render(<Host onAdd={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Add' });   // exact: no "Add A"
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('a');
  });
  it('the outside-click listener is installed once per open, not once per render', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const { rerender } = render(<Host onAdd={vi.fn()} start={{}} />);
    const before = add.mock.calls.filter((c) => c[0] === 'pointerdown').length;
    rerender(<Host onAdd={vi.fn()} start={{}} />);
    expect(add.mock.calls.filter((c) => c[0] === 'pointerdown').length).toBe(before);
    add.mockRestore();
  });
});
