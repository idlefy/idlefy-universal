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
import { resolveSelection, groupId, blockId } from '../src/app/selection';

afterEach(cleanup);
const text = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'graph', '__fixtures__', 'example-01-hello-world.values.yaml'), 'utf8');
const { manifests, values } = loadFixture('example-01-hello-world');
const g = buildGraph(manifests, values, 'default');
const dep = g.nodes.find((n) => n.kind === 'Deployment')!;
const base = () => ({
  sel: { kind: 'node' as const, node: dep }, root: schema as any, doc: ValuesDocument.parse(text), tier: 'basic' as const, disabled: false, nodes: g.nodes, focusToken: 0,
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
    expect(screen.getByLabelText('open group')).toBeTruthy();
    expect(document.querySelector('.detail pre')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Manifest' }));
    expect(p.onTab).toHaveBeenCalledWith('yaml');
    rerender(<DetailPanel {...p} tab="yaml" />);
    expect(document.querySelector('.detail pre')!.textContent).toContain('kind: Deployment');
    expect(screen.getByText('Copy manifest')).toBeTruthy();
    expect(screen.queryByLabelText('open group')).toBeNull();
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
    expect(render(<DetailPanel {...p} sel={null} tab="inspector" />).container.innerHTML).toBe('');
  });
  it('group selection: group header, Resources/Manifests tabs, no show-all, concatenated manifests', () => {
    const p = { ...base(), sel: resolveSelection(g, groupId(dep.id)) };
    const { container, rerender } = render(<DetailPanel {...p} tab="inspector" />);
    expect(container.querySelector('.head b')!.textContent).toBe('hello');
    expect(container.querySelector('.head .kind')!.textContent).toBe('Deployment group');
    expect(container.querySelector('.head .meta')!.textContent).toContain('2 resources');
    expect(screen.getByRole('tab', { name: 'Resources' })).toBeTruthy();
    expect(screen.queryByLabelText('show all fields')).toBeNull();
    expect(screen.getByLabelText('toggle Service')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Manifests' }));
    expect(p.onTab).toHaveBeenCalledWith('yaml');
    rerender(<DetailPanel {...p} tab="yaml" />);
    const pre = document.querySelector('.detail pre')!.textContent!;
    expect(pre).toContain('kind: Deployment');
    expect(pre).toContain('kind: Service');
    expect(pre).toContain('\n---\n');
    expect(screen.getByText('Copy manifests')).toBeTruthy();
  });
  it('block selection: kind header, Fields tab only, inspector even when the tab state says yaml', () => {
    const p = { ...base(), sel: resolveSelection(g, blockId(['deployments', 'hello', 'ingress'])) };
    const { container } = render(<DetailPanel {...p} tab="yaml" />);
    expect(container.querySelector('.head b')!.textContent).toBe('hello');
    expect(container.querySelector('.head .kind')!.textContent).toBe('Ingress');
    expect(screen.queryByRole('tab', { name: 'Manifest' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Fields' })).toBeTruthy();
    expect(screen.getByLabelText('toggle Ingress')).toBeTruthy();
    expect(screen.getByLabelText('show all fields')).toBeTruthy();
  });
});
