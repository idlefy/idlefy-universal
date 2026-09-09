// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { Canvas } from '../src/canvas/Canvas';
import type { GraphModel } from '../src/graph/types';

afterEach(cleanup);

// React Flow measures its pane with a ResizeObserver, which jsdom does not implement.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Zero manifest nodes: only the always-present Release node (see src/graph/build.ts), which
// never carries a `manifest`.
const model: GraphModel = {
  nodes: [
    {
      id: 'release', key: 'release', kind: 'Release', name: 'settings', namespace: 'default', family: 'config',
      external: false, conflict: false, hookBadge: false, warnings: [],
      provenance: { path: [], governingCondition: 'always', removeAction: [] },
    },
  ],
  edges: [],
  warnings: [],
};

const noop = () => {};

describe('Canvas empty state', () => {
  it('renders the emptyState slot instead of the overlay when given one', async () => {
    render(
      <Canvas model={model} stale={false} selection={null} onSelect={noop} onAddResource={noop}
        emptyState={<div data-testid="slot" />} />,
    );
    await waitFor(() => expect(screen.getByTestId('slot')).toBeTruthy());
    expect(screen.queryByText('No resources rendered yet.')).toBeNull();
  });

  it('falls back to the "No resources rendered yet." overlay when no slot is given', async () => {
    render(<Canvas model={model} stale={false} selection={null} onSelect={noop} onAddResource={noop} />);
    await waitFor(() => expect(screen.getByText('No resources rendered yet.')).toBeTruthy());
  });
});
