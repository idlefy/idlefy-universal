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
const text = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'graph', '__fixtures__', 'example-01-hello-world.values.yaml'), 'utf8');
const { manifests, values } = loadFixture('example-01-hello-world');
const g = buildGraph(manifests, values, 'default');
const dep = g.nodes.find((n) => n.kind === 'Deployment')!;
const base = () => ({
  node: dep, root: schema as any, doc: ValuesDocument.parse(text), tier: 'basic' as const, disabled: false, nodes: g.nodes,
  onTab: vi.fn(), onTier: vi.fn(), onEdit: vi.fn(), onClose: vi.fn(), onHide: vi.fn(), onSelect: vi.fn(),
});

describe('DetailPanel', () => {
  it('header shows icon, name, kind, namespace and the values line', () => {
    const { container } = render(<DetailPanel {...base()} tab="inspector" />);
    expect(container.querySelector('.head .kicon')).toBeTruthy();
    expect(container.querySelector('.head b')!.textContent).toBe('hello');
    expect(container.querySelector('.head .kind')!.textContent).toBe('Deployment');
    expect(container.querySelector('.head .meta')!.textContent).toContain('namespace default');
    expect(container.querySelector('.head .meta')!.textContent).toMatch(/line \d+/);
  });
  it('Fields tab shows the inspector, Manifest tab shows the rendered object', () => {
    const p = base();
    const { rerender } = render(<DetailPanel {...p} tab="inspector" />);
    expect(screen.getByLabelText('toggle Service')).toBeTruthy();
    expect(document.querySelector('.detail pre')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Manifest' }));
    expect(p.onTab).toHaveBeenCalledWith('yaml');
    rerender(<DetailPanel {...p} tab="yaml" />);
    expect(document.querySelector('.detail pre')!.textContent).toContain('kind: Deployment');
    expect(screen.getByText('Copy manifest')).toBeTruthy();
    expect(screen.queryByLabelText('toggle Service')).toBeNull();
  });
  it('show-all lives in the bar and drives onTier', () => {
    const p = base();
    render(<DetailPanel {...p} tab="inspector" />);
    fireEvent.click(screen.getByLabelText('show all fields'));
    expect(p.onTier).toHaveBeenCalledWith('advanced');
  });
  it('hide and close buttons call back; nothing renders without a node', () => {
    const p = base();
    render(<DetailPanel {...p} tab="inspector" />);
    fireEvent.click(screen.getByLabelText('Hide the inspector'));
    expect(p.onHide).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('close'));
    expect(p.onClose).toHaveBeenCalled();
    cleanup();
    expect(render(<DetailPanel {...p} node={null} tab="inspector" />).container.innerHTML).toBe('');
  });
});
