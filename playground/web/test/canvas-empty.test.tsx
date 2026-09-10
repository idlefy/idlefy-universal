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
      <Canvas model={model} booting={false} stale={false} selection={null} onSelect={noop} onAddResource={noop}
        emptyState={<div data-testid="slot" />} />,
    );
    await waitFor(() => expect(screen.getByTestId('slot')).toBeTruthy());
    expect(screen.queryByText('No resources rendered yet.')).toBeNull();
  });

  it('falls back to the "No resources rendered yet." overlay when no slot is given', async () => {
    render(<Canvas model={model} booting={false} stale={false} selection={null} onSelect={noop} onAddResource={noop} />);
    await waitFor(() => expect(screen.getByText('No resources rendered yet.')).toBeTruthy());
  });

  it('says the engine is starting while it boots, and not "paste or pick" over a loaded document', () => {
    render(<Canvas model={null} booting stale={false} selection={null} onSelect={noop} onAddResource={noop} />);
    expect(screen.getByText('Starting the Helm engine…')).toBeTruthy();
    cleanup();
    render(<Canvas model={null} booting={false} stale={false} selection={null} onSelect={noop} onAddResource={noop} />);
    expect(screen.getByText('Paste or pick an example on the left to see the resources it produces.')).toBeTruthy();
  });
  it('withholds the empty card until this model has been laid out', async () => {
    render(
      <Canvas model={model} booting={false} stale={false} selection={null} onSelect={noop} onAddResource={noop}
        emptyState={<div data-testid="slot" />} />,
    );
    // Synchronous: layoutGraph's promise cannot settle inside RTL's act(), so this is the first
    // paint — exactly the tick where the card used to appear over the previous ELK layout.
    expect(screen.queryByTestId('slot')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('slot')).toBeTruthy());
  });
});
