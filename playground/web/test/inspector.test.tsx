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
  it('release node lists only the release-level sections', () => {
    render(<Inspector {...base(rel)} tier="advanced" />);
    for (const k of ['generic', 'deploymentsGeneral', 'statefulSetsGeneral', 'daemonSetsGeneral', 'secretRefs']) expect(screen.getByText(k)).toBeTruthy();
    expect(screen.queryByText('deployments')).toBeNull();
  });
  it('disabled state blocks edits and says why', () => {
    const p = { ...base(dep), disabled: true };
    render(<Inspector {...p} />);
    expect(screen.getByText(/fix the YAML/i)).toBeTruthy();
    expect((screen.getByLabelText('toggle Service') as HTMLInputElement).disabled).toBe(true);
  });
});
