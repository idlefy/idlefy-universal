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
const nodeSel = (n: any) => ({ kind: 'node' as const, node: n });
const base = (sel: any) => ({ sel, root, doc: ValuesDocument.parse(text), tier: 'basic' as const, nodes: g.nodes, onEdit: vi.fn(), onSelect: vi.fn(), onTier: vi.fn(), disabled: false });

const ffText = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'graph', '__fixtures__', 'full-features.values.yaml'), 'utf8');
const ff = (() => { const f = loadFixture('full-features'); return buildGraph(f.manifests, f.values, 'default'); })();
const ffNode = (kind: string, name: string) => ff.nodes.find((n) => n.kind === kind && n.name === name)!;
const ffBase = (sel: any) => ({ sel, root, doc: ValuesDocument.parse(ffText), tier: 'basic' as const, nodes: ff.nodes, onEdit: vi.fn(), onSelect: vi.fn(), onTier: vi.fn(), disabled: false });

// Absent optional fields now render as an "add field" chip instead of an empty control (task 6);
// a field is reachable either as a live control, its chip, or — for block widgets (object/map/keyvalue/
// yaml), whose own <label for=id> targets a wrapper <div> that carries no matching id — the row's label
// element itself. Reused by task 7.
const reachable = (id: string) =>
  screen.queryByLabelText(id) ?? screen.queryByLabelText(`add field ${id}`) ?? document.querySelector(`label[for="${CSS.escape(id)}"]`);

describe('Inspector', () => {
  it('workload panel: no switches, owner strip names the group and opens it', () => {
    const p = base(nodeSel(dep));
    render(<Inspector {...p} />);
    expect(screen.queryByLabelText('toggle Service')).toBeNull();
    expect(screen.queryByLabelText('deployments.hello.autoCreateService')).toBeNull();
    const strip = document.querySelector('.owner')!;
    expect(strip.textContent).toContain('In group hello');
    expect(strip.textContent).toContain('Service');          // the one member of the hello-world example
    fireEvent.click(screen.getByLabelText('open group'));
    expect(p.onSelect).toHaveBeenCalledWith(`group:${dep.id}`);
  });
  it('tier="advanced" reveals advanced chips hidden on tier="basic"', () => {
    const p = base(nodeSel(dep));
    const { rerender } = render(<Inspector {...p} tier="basic" />);
    expect(reachable('deployments.hello.priorityClassName')).toBeNull();
    rerender(<Inspector {...p} tier="advanced" />);
    expect(reachable('deployments.hello.priorityClassName')).toBeTruthy();
  });
  it.skip('auto-created Service opens the owner and names the toggle', () => {
    // rewritten in Task 10
    render(<Inspector {...base(nodeSel(svc))} />);
    expect(screen.getByText(/configured on Deployment hello/i)).toBeTruthy();
    expect((screen.getByLabelText('toggle Service') as HTMLInputElement).checked).toBe(true);
  });
  it('hides only the autoCreate flags the toggle table owns', () => {
    render(<Inspector {...ffBase(nodeSel(ffNode('Deployment', 'api')))} tier="advanced" />);
    // no toggle exists for autoCreateSoftAntiAffinity, so it has to stay reachable as a field
    expect(reachable('deployments.api.autoCreateSoftAntiAffinity')).toBeTruthy();
    expect(reachable('deployments.api.autoCreateService')).toBeNull();
  });
  // Secondary config blocks are reached through the auto-created list, never as fields (spec §5.2);
  // the list itself only offers what the chart renders for the kind (spec 2026-09-05 §2.2).
  it('offers no secondary block as a field and no switches on the workload panel', () => {
    render(<Inspector {...ffBase(nodeSel(ffNode('StatefulSet', 'cache')))} tier="advanced" />);
    for (const k of ['ingress', 'httpRoute', 'certificate', 'hpa', 'pdb', 'networkPolicy']) expect(reachable(`statefulSets.cache.${k}`), k).toBeNull();
    expect(screen.queryAllByRole('switch')).toEqual([]);
  });
  it('groups workload fields into named sections in spec order', () => {
    const { container } = render(<Inspector {...ffBase(nodeSel(ffNode('Deployment', 'api')))} tier="advanced" />);
    const titles = [...container.querySelectorAll('.sec > h3')].map((h) => h.firstChild!.textContent!.trim());
    expect(titles.slice(0, 3)).toEqual(['Workload', 'Containers', 'Metadata']);
    expect(titles).toContain('Placement & security');
    expect(container.querySelector('.sec .fields .field-head label')!.textContent).toMatch(/replicas/i);
  });
  it('basic tier collapses hidden advanced sections into one footer note', () => {
    const p = base(nodeSel(dep));
    const { container, rerender } = render(<Inspector {...p} tier="basic" />);
    expect(container.querySelector('.sec.adv')).toBeNull();
    expect(screen.getByText('Placement & security hidden')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('show hidden sections'));
    expect(p.onTier).toHaveBeenCalledWith('advanced');
    rerender(<Inspector {...p} tier="advanced" />);
    expect(container.querySelector('.hidden-note')).toBeNull();
  });
  it('release panel names its sections', () => {
    render(<Inspector {...base(nodeSel(rel))} />);
    expect(screen.getByText('Release-wide')).toBeTruthy();
    expect(screen.getByText('Defaults for every Deployment')).toBeTruthy();
  });
  // An owned entity's prov line names the owner by its kind label, not the raw values-map key
  // (regression: 'Part of deployments api' instead of 'Part of Deployment api').
  it('entity panel names the owner by kind label', () => {
    const cm = ffNode('ConfigMap', 'app-config');
    const owned = { ...cm, provenance: { ...cm.provenance!, owner: ['deployments', 'api'] } };
    render(<Inspector {...ffBase(nodeSel(owned))} />);
    expect(screen.getByText(/Part of Deployment api/)).toBeTruthy();
  });
  it('widget drafts do not leak into the next selected node', () => {
    const p = ffBase(nodeSel(ffNode('Deployment', 'api')));
    const { rerender } = render(<Inspector {...p} />);
    fireEvent.change(screen.getByLabelText('new key deployments.api.containers'), { target: { value: 'sidecar' } });
    expect((screen.getByLabelText('new key deployments.api.containers') as HTMLInputElement).value).toBe('sidecar');
    rerender(<Inspector {...p} sel={nodeSel(ffNode('StatefulSet', 'cache'))} />);
    expect((screen.getByLabelText('new key statefulSets.cache.containers') as HTMLInputElement).value).toBe('');
  });
  it('release node lists only the release-level sections', () => {
    const { container } = render(<Inspector {...base(nodeSel(rel))} tier="advanced" />);
    const sections = [...container.querySelectorAll('.inspector > fieldset > .sec > h3 > .k')].map((s) => s.textContent);
    expect(sections).toEqual(['generic', 'deploymentsGeneral', 'statefulSetsGeneral', 'daemonSetsGeneral', 'secretRefs']);
    expect(screen.queryByText('deployments')).toBeNull();
  });
  // _defaults.tpl copies only content keys from <kind>General onto instances, never the autoCreate*
  // flags (see expectations.ts), so those checkboxes would be inert here.
  it('release: hides the autoCreate* flags <kind>General cannot propagate', () => {
    render(<Inspector {...base(nodeSel(rel))} tier="advanced" />);
    screen.queryAllByRole('button', { name: /^show \d+ more fields$/ }).forEach((b) => fireEvent.click(b));
    expect(reachable('deploymentsGeneral.autoCreateService')).toBeNull();
    expect(reachable('deploymentsGeneral.autoCreateIngress')).toBeNull();
    // autoCreateSoftAntiAffinity has no toggle and is honoured by the chart — it stays.
    expect(reachable('deploymentsGeneral.autoCreateSoftAntiAffinity')).toBeTruthy();
    expect(reachable('deploymentsGeneral.replicas')).toBeTruthy();
  });
  it('release: basic tier names hidden sections in the footer instead of placeholder headings', () => {
    const { container } = render(<Inspector {...base(nodeSel(rel))} tier="basic" />);
    expect(container.querySelector('.sec.adv')).toBeNull();
    const note = container.querySelector('.hidden-note');
    expect(note).toBeTruthy();
    expect(note!.textContent).toMatch(/Defaults for every StatefulSet/);
  });
  it('release: a section the schema shapes as a map still gets an editor', () => {
    const p = base(nodeSel(rel));
    render(<Inspector {...p} tier="advanced" />);
    const ta = screen.getByLabelText('secretRefs') as HTMLTextAreaElement;
    expect(ta.tagName).toBe('TEXTAREA');
    fireEvent.change(ta, { target: { value: 'db:\n  - name: DB_URL\n    secretName: db\n    key: url\n' } });
    fireEvent.blur(ta);
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['secretRefs'], value: { db: [{ name: 'DB_URL', secretName: 'db', key: 'url' }] } }]);
  });
  it('disabled state blocks edits and says why', () => {
    const p = { ...base(nodeSel(dep)), disabled: true };
    render(<Inspector {...p} />);
    expect(screen.getByText(/fix the YAML/i)).toBeTruthy();
    expect((document.querySelector('.inspector fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  });
});
