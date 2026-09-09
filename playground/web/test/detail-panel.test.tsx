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

const ssText = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'graph', '__fixtures__', 'stateful-storage.values.yaml'), 'utf8');
const ss = loadFixture('stateful-storage');
const ssGraph = buildGraph(ss.manifests, ss.values, 'default');
const filesDep = ssGraph.nodes.find((n) => n.kind === 'Deployment' && n.name === 'files')!;
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
  it('group selection with no other members uses the singular "1 resource"', () => {
    const p = { ...base(), sel: resolveSelection(ssGraph, groupId(filesDep.id)), doc: ValuesDocument.parse(ssText), nodes: ssGraph.nodes };
    const { container } = render(<DetailPanel {...p} tab="inspector" />);
    expect(container.querySelector('.head .meta')!.textContent).toContain('1 resource');
    expect(container.querySelector('.head .meta')!.textContent).not.toContain('1 resources');
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
  it('Remove: present for a workload with its ops, dispatches edit then close', () => {
    const p = base();
    render(<DetailPanel {...p} tab="inspector" />);
    const btn = screen.getByLabelText('Remove Deployment hello') as HTMLButtonElement;
    expect(btn.title).toBe('Remove Deployment hello · Ctrl+Z in the editor restores');
    expect(btn.className).toContain('danger');
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(p.onEdit).toHaveBeenCalledWith([{ op: 'delete', path: ['deployments', 'hello'] }]);
    expect(p.onClose).toHaveBeenCalled();
    expect(p.onEdit.mock.invocationCallOrder[0]).toBeLessThan(p.onClose.mock.invocationCallOrder[0]);
  });
  it('Remove: group shows the member count; absent for a secondary node, a block and the Release node', () => {
    const p = base();
    const { rerender } = render(<DetailPanel {...p} sel={resolveSelection(g, groupId(dep.id))!} tab="inspector" />);
    expect((screen.getByLabelText('Remove Deployment hello') as HTMLButtonElement).title).toContain('and its 1 rendered resource');
    const svc = g.nodes.find((n) => n.kind === 'Service')!;
    rerender(<DetailPanel {...p} sel={resolveSelection(g, svc.id)!} tab="inspector" />);
    expect(screen.queryByLabelText(/^Remove /)).toBeNull();
    rerender(<DetailPanel {...p} sel={resolveSelection(g, blockId(['deployments', 'hello', 'hpa']))!} tab="inspector" />);
    expect(screen.queryByLabelText(/^Remove /)).toBeNull();
    const release = g.nodes.find((n) => n.kind === 'Release')!;
    rerender(<DetailPanel {...p} sel={resolveSelection(g, release.id)!} tab="inspector" />);
    expect(screen.queryByLabelText(/^Remove /)).toBeNull();
  });
  it('Remove: disabled with the inspector\'s notice while the YAML is broken', () => {
    const p = base();
    render(<DetailPanel {...p} disabled tab="inspector" />);
    const btn = screen.getByLabelText('Remove Deployment hello') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('Fix the YAML syntax error in the editor to edit here.');
    fireEvent.click(btn);
    expect(p.onEdit).not.toHaveBeenCalled();
  });
});
