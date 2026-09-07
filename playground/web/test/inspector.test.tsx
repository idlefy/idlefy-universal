// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import schema from '../src/chart-bundle/schema.json';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';
import { ValuesDocument } from '../src/model/ValuesDocument';
import { Inspector } from '../src/inspector/Inspector';
import fs from 'node:fs';
import path from 'node:path';

const root = schema as any;
afterEach(cleanup);
const text = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'graph', '__fixtures__', 'example-01-hello-world.values.yaml'), 'utf8');
const { manifests, values } = loadFixture('example-01-hello-world');
const g = buildGraph(manifests, values, 'default');
const dep = g.nodes.find((n) => n.kind === 'Deployment')!;
const svc = g.nodes.find((n) => n.kind === 'Service')!;
const rel = g.nodes.find((n) => n.kind === 'Release')!;
const base = (n: any) => ({ node: n, root, doc: ValuesDocument.parse(text), tier: 'basic' as const, onTier: vi.fn(), onEdit: vi.fn(), disabled: false });

const ffText = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'graph', '__fixtures__', 'full-features.values.yaml'), 'utf8');
const ff = (() => { const f = loadFixture('full-features'); return buildGraph(f.manifests, f.values, 'default'); })();
const ffNode = (kind: string, name: string) => ff.nodes.find((n) => n.kind === kind && n.name === name)!;
const ffBase = (n: any) => ({ node: n, root, doc: ValuesDocument.parse(ffText), tier: 'basic' as const, onTier: vi.fn(), onEdit: vi.fn(), disabled: false });

describe('Inspector', () => {
  it('workload: shows applicable toggles with state, hides autoCreate* from the field list', () => {
    const p = base(dep);
    render(<Inspector {...p} />);
    const svcToggle = screen.getByLabelText('toggle Service') as HTMLInputElement;
    expect(svcToggle.checked).toBe(true);
    expect(screen.queryByLabelText('toggle ServiceMonitor')).toBeTruthy();
    expect(screen.queryByLabelText('deployments.hello.autoCreateService')).toBeNull();
    fireEvent.click(svcToggle);
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['deployments', 'hello', 'autoCreateService'], value: false }]);
    fireEvent.click(screen.getByLabelText('toggle NetworkPolicy'));
    expect(p.onEdit).toHaveBeenLastCalledWith([
      { op: 'set', path: ['deployments', 'hello', 'autoCreateNetworkPolicy'], value: true },
      { op: 'set', path: ['deployments', 'hello', 'networkPolicy'], value: { policyTypes: ['Ingress'], ingress: [] } },
    ]);
  });
  it('tier switch calls onTier and advanced reveals more fields', () => {
    const p = base(dep);
    const { rerender } = render(<Inspector {...p} />);
    expect(screen.queryByLabelText('deployments.hello.priorityClassName')).toBeNull();
    fireEvent.click(screen.getByLabelText('Advanced'));
    expect(p.onTier).toHaveBeenCalledWith('advanced');
    rerender(<Inspector {...p} tier="advanced" />);
    expect(screen.getByLabelText('deployments.hello.priorityClassName')).toBeTruthy();
  });
  it('auto-created Service opens the owner and names the toggle', () => {
    render(<Inspector {...base(svc)} />);
    expect(screen.getByText(/configured on Deployment hello/i)).toBeTruthy();
    expect((screen.getByLabelText('toggle Service') as HTMLInputElement).checked).toBe(true);
  });
  it('hides only the autoCreate flags the toggle table owns', () => {
    render(<Inspector {...ffBase(ffNode('Deployment', 'api'))} tier="advanced" />);
    // no toggle exists for autoCreateSoftAntiAffinity, so it has to stay reachable as a field
    expect(screen.getByLabelText('deployments.api.autoCreateSoftAntiAffinity')).toBeTruthy();
    expect(screen.queryByLabelText('deployments.api.autoCreateService')).toBeNull();
  });
  it('widget drafts do not leak into the next selected node', () => {
    const p = ffBase(ffNode('Deployment', 'api'));
    const { rerender } = render(<Inspector {...p} />);
    fireEvent.change(screen.getByLabelText('new key deployments.api.containers'), { target: { value: 'sidecar' } });
    expect((screen.getByLabelText('new key deployments.api.containers') as HTMLInputElement).value).toBe('sidecar');
    rerender(<Inspector {...p} node={ffNode('StatefulSet', 'cache')} />);
    expect((screen.getByLabelText('new key statefulSets.cache.containers') as HTMLInputElement).value).toBe('');
  });
  it('release node lists only the release-level sections', () => {
    const { container } = render(<Inspector {...base(rel)} tier="advanced" />);
    const sections = [...container.querySelectorAll('.inspector > fieldset > details > summary')].map((s) => s.textContent);
    expect(sections).toEqual(['generic', 'deploymentsGeneral', 'statefulSetsGeneral', 'daemonSetsGeneral', 'secretRefs']);
    expect(screen.queryByText('deployments')).toBeNull();
  });
  it('release: a section the schema shapes as a map still gets an editor', () => {
    const p = base(rel);
    render(<Inspector {...p} tier="advanced" />);
    const ta = screen.getByLabelText('secretRefs') as HTMLTextAreaElement;
    expect(ta.tagName).toBe('TEXTAREA');
    fireEvent.change(ta, { target: { value: 'db:\n  - name: DB_URL\n    secretName: db\n    key: url\n' } });
    fireEvent.blur(ta);
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['secretRefs'], value: { db: [{ name: 'DB_URL', secretName: 'db', key: 'url' }] } }]);
  });
  it('disabled state blocks edits and says why', () => {
    const p = { ...base(dep), disabled: true };
    render(<Inspector {...p} />);
    expect(screen.getByText(/fix the YAML/i)).toBeTruthy();
    expect((screen.getByLabelText('toggle Service') as HTMLInputElement).disabled).toBe(true);
  });
});
