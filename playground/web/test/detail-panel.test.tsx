// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import schema from '../src/chart-bundle/schema.json';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';
import { ValuesDocument } from '../src/model/ValuesDocument';
import { DetailPanel } from '../src/canvas/DetailPanel';

afterEach(cleanup);
const text = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'graph', '__fixtures__', 'example-01-hello-world.values.yaml'),
  'utf8',
);
const { manifests, values } = loadFixture('example-01-hello-world');
const dep = buildGraph(manifests, values, 'default').nodes.find((n) => n.kind === 'Deployment')!;
const base = () => ({
  node: dep, root: schema as any, doc: ValuesDocument.parse(text), tier: 'basic' as const,
  disabled: false, onTab: vi.fn(), onTier: vi.fn(), onEdit: vi.fn(), onClose: vi.fn(),
});

describe('DetailPanel', () => {
  it('renders the inspector on the inspector tab and the manifest on the yaml tab', () => {
    const p = base();
    const { rerender } = render(<DetailPanel {...p} tab="inspector" />);
    expect(screen.getByLabelText('toggle Service')).toBeTruthy();
    expect(document.querySelector('.detail pre')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'YAML' }));
    expect(p.onTab).toHaveBeenCalledWith('yaml');
    rerender(<DetailPanel {...p} tab="yaml" />);
    expect(document.querySelector('.detail pre')!.textContent).toContain('kind: Deployment');
    expect(screen.queryByLabelText('toggle Service')).toBeNull();
  });

  it('close stays reachable and nothing renders without a node', () => {
    const p = base();
    render(<DetailPanel {...p} tab="inspector" />);
    fireEvent.click(screen.getByLabelText('close'));
    expect(p.onClose).toHaveBeenCalled();
    cleanup();
    expect(render(<DetailPanel {...p} node={null} tab="inspector" />).container.innerHTML).toBe('');
  });
});
