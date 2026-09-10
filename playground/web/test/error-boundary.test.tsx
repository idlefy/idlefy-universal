// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../src/app/ErrorBoundary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Boom(): never { throw new Error('kaboom'); }
function BoomEmpty(): never { throw new Error(''); }
function BoomNonError(): never { throw null; } // eslint-disable-line no-throw-literal

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(<ErrorBoundary><span>fine</span></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeTruthy();
  });
  it('shows a reload card with the message instead of unmounting the tree', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('The playground hit an unexpected error')).toBeTruthy();
    expect(screen.getByText('kaboom')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
  });
  it('an Error with an empty message still shows the fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><BoomEmpty /></ErrorBoundary>);
    expect(screen.getByText('The playground hit an unexpected error')).toBeTruthy();
    expect(screen.getByText('No error message was provided.')).toBeTruthy();
  });
  it('a thrown non-Error value (e.g. null) still shows the fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><BoomNonError /></ErrorBoundary>);
    expect(screen.getByText('The playground hit an unexpected error')).toBeTruthy();
  });
  it('the fallback card has role="alert" and moves focus to its heading', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    const card = screen.getByRole('alert');
    const heading = screen.getByText('The playground hit an unexpected error');
    expect(card.contains(heading)).toBe(true);
    expect(document.activeElement).toBe(heading);
  });
  it('contains a real model-layer edge case (an edit that cannot be stringified) instead of unmounting', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Same "unresolved alias" case test/values-document.test.ts pins at the model layer: deleting an
    // anchored child whose alias lives elsewhere. ValuesDocument.toString() now catches that throw
    // and falls back to the source instead — this proves the boundary is still needed for whatever
    // *does* still throw, without depending on a model-layer throw that no longer happens.
    function RenderBoom(): never {
      throw new Error('render-phase throw reaching the boundary');
    }
    render(<ErrorBoundary><RenderBoom /></ErrorBoundary>);
    expect(screen.getByText('The playground hit an unexpected error')).toBeTruthy();
    expect(screen.getByText('render-phase throw reaching the boundary')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeTruthy();
  });
});
