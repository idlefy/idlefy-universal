// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../src/app/ErrorBoundary';
import { ValuesDocument } from '../src/model/ValuesDocument';

afterEach(cleanup);
function Boom(): never { throw new Error('kaboom'); }

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><span>fine</span></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeTruthy();
  });
  it('shows a reload card with the message instead of unmounting the tree', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('The playground hit an unexpected error')).toBeTruthy();
    expect(screen.getByText('kaboom')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
    spy.mockRestore();
  });
  it('contains a real model-layer throw (unresolved alias on apply) instead of unmounting', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function AliasBoom(): never {
      const doc = ValuesDocument.parse('a: &x\n  b: 1\nc: *x\n');
      doc.apply([{ op: 'set', path: ['a'], value: 2 }]).toString();
      throw new Error('unreachable: apply().toString() should have thrown');
    }
    render(<ErrorBoundary><AliasBoom /></ErrorBoundary>);
    expect(screen.getByText('The playground hit an unexpected error')).toBeTruthy();
    expect(screen.getByText(/Unresolved alias/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
    spy.mockRestore();
  });
});
