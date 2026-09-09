// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import schema from '../src/chart-bundle/schema.json';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';
import { ValuesDocument } from '../src/model/ValuesDocument';
import { Inspector } from '../src/inspector/Inspector';
import { resolveSelection, groupId, blockId } from '../src/app/selection';
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
const base = (sel: any) => ({ sel, root, doc: ValuesDocument.parse(text), tier: 'basic' as const, nodes: g.nodes, onEdit: vi.fn(), onSelect: vi.fn(), onTier: vi.fn(), disabled: false, focusToken: 0 });

const ffText = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'graph', '__fixtures__', 'full-features.values.yaml'), 'utf8');
const ff = (() => { const f = loadFixture('full-features'); return buildGraph(f.manifests, f.values, 'default'); })();
const ffNode = (kind: string, name: string) => ff.nodes.find((n) => n.kind === kind && n.name === name)!;
const ffBase = (sel: any) => ({ sel, root, doc: ValuesDocument.parse(ffText), tier: 'basic' as const, nodes: ff.nodes, onEdit: vi.fn(), onSelect: vi.fn(), onTier: vi.fn(), disabled: false, focusToken: 0 });

// Absent optional fields render as an "add field" chip instead of an empty control;
// a field is reachable either as a live control, its chip, or — for block widgets (object/map/keyvalue/
// yaml), whose own <label for=id> targets a wrapper <div> that carries no matching id — the row's label
// element itself. Reused throughout this file.
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
  it('secondary: Service panel names its owner, shows owner service keys and ports', () => {
    const p = base(nodeSel(svc));
    render(<Inspector {...p} />);
    expect(document.querySelector('.owner')!.textContent).toContain('Created for Deployment hello');
    fireEvent.click(screen.getByLabelText('open owner'));
    expect(p.onSelect).toHaveBeenCalledWith(dep.id);
    expect((screen.getByLabelText('toggle Service') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('turning off keeps the settings in values.yaml')).toBeTruthy();
    expect(reachable('deployments.hello.serviceType')).toBeTruthy();
    expect(screen.getByText('Ports')).toBeTruthy();
    const ports = [...document.querySelectorAll('.sec')].find((s) => s.querySelector('h3')?.textContent === 'Ports')!;
    expect(ports.querySelector('.fields')!.textContent).toContain('80 → 80/TCP');
    fireEvent.click(screen.getByLabelText('edit ports on owner'));
    expect(p.onSelect).toHaveBeenLastCalledWith(dep.id);
    expect(screen.queryByLabelText('deployments.hello.replicas')).toBeNull();
  });
  it('secondary: StatefulSet Service exposes serviceName and serviceHeadless', () => {
    render(<Inspector {...ffBase(nodeSel(ffNode('Service', 'cache-headless')))} />);
    expect(reachable('statefulSets.cache.serviceName')).toBeTruthy();
    expect(reachable('statefulSets.cache.serviceHeadless')).toBeTruthy();
  });
  it('secondary: Ingress panel renders only its block in spec sections', () => {
    const { container } = render(<Inspector {...ffBase(nodeSel(ffNode('Ingress', 'api')))} tier="advanced" />);
    const titles = [...container.querySelectorAll('.sec > h3')].map((h) => h.firstChild!.textContent!.trim());
    expect(titles[0]).toBe('Routing');
    expect(reachable('deployments.api.ingress.hosts')).toBeTruthy();
    expect(reachable('deployments.api.replicas')).toBeNull();
    expect(screen.queryByLabelText('toggle Service')).toBeNull();
  });
  it('secondary: switching off a block that is deleted hands the selection to the group', () => {
    const p = ffBase(nodeSel(ffNode('PodDisruptionBudget', 'api')));
    render(<Inspector {...p} />);
    expect(screen.getByText('turning off removes its settings from values.yaml')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('toggle PodDisruptionBudget'));
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['deployments', 'api', 'autoCreatePdb'], value: false }, { op: 'delete', path: ['deployments', 'api', 'pdb'] }]);
    expect(p.onSelect).toHaveBeenLastCalledWith(groupId(ffNode('Deployment', 'api').id));
  });
  it('secondary: a nodeless block opens with its switch off and its fields editable', () => {
    const p = ffBase(resolveSelection(ff, blockId(['deployments', 'api', 'hpa']))!);
    render(<Inspector {...p} />);
    const sw = screen.getByLabelText('toggle HorizontalPodAutoscaler') as HTMLInputElement;
    expect(sw.checked).toBe(false);
    fireEvent.click(sw);
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['deployments', 'api', 'hpa'], value: { minReplicas: 1, maxReplicas: 3 } }]);
    expect(reachable('deployments.api.hpa.minReplicas')).toBeTruthy();   // Scaling section chips/fields render from the schema even while unset
  });
  it('hides only the autoCreate flags the toggle table owns', () => {
    render(<Inspector {...ffBase(nodeSel(ffNode('Deployment', 'api')))} tier="advanced" />);
    // no toggle exists for autoCreateSoftAntiAffinity, so it has to stay reachable as a field
    expect(reachable('deployments.api.autoCreateSoftAntiAffinity')).toBeTruthy();
    expect(reachable('deployments.api.autoCreateService')).toBeNull();
  });
  // Secondary config blocks are reached through the auto-created list, never as fields;
  // the list itself only offers what the chart renders for the kind.
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
    // Metadata has nothing to show at basic tier here (no labels/annotations set) but does at advanced,
    // so it joins Placement & security in the footer note
    expect(screen.getByText('Metadata, Placement & security hidden')).toBeTruthy();
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
    const note = container.querySelector('.hidden-note');
    expect(note).toBeTruthy();
    expect(note!.textContent).toMatch(/Defaults for every StatefulSet/);
  });
  it('release: secretRefs renders as cards of variable rows, never a textarea', () => {
    const p = base(nodeSel(rel));
    const doc = ValuesDocument.parse(text + 'secretRefs:\n  db:\n    - name: DB_URL\n      secretKeyRef: {name: db, key: url}\n');
    render(<Inspector {...p} doc={doc} tier="advanced" />);
    expect(screen.queryByLabelText('secretRefs')).toBeNull();
    fireEvent.change(screen.getByLabelText('secretRefs.db.0.name'), { target: { value: 'DATABASE_URL' } });
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['secretRefs', 'db', 0, 'name'], value: 'DATABASE_URL' }]);
  });
  it('group panel: workload row, switches with state, opens nodes', () => {
    const p = base(resolveSelection(g, groupId(dep.id))!);
    render(<Inspector {...p} />);
    const row = document.querySelector('.list .it')!;
    expect(row.textContent).toContain('Deployment');
    expect(row.textContent).toContain('1 replica · nginx:1.27-alpine');
    fireEvent.click(screen.getByLabelText('open Deployment'));
    expect(p.onSelect).toHaveBeenCalledWith(dep.id);
    const svcToggle = screen.getByLabelText('toggle Service') as HTMLInputElement;
    expect(svcToggle.checked).toBe(true);
    fireEvent.click(svcToggle);
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['deployments', 'hello', 'autoCreateService'], value: false }]);
    fireEvent.click(screen.getByLabelText('toggle NetworkPolicy'));
    expect(p.onEdit).toHaveBeenLastCalledWith([
      { op: 'set', path: ['deployments', 'hello', 'autoCreateNetworkPolicy'], value: true },
      { op: 'set', path: ['deployments', 'hello', 'networkPolicy'], value: { policyTypes: ['Ingress'], ingress: [] } },
    ]);
    fireEvent.click(screen.getByLabelText('open Service'));
    expect(p.onSelect).toHaveBeenCalledWith(svc.id);
    fireEvent.click(screen.getByLabelText('open Ingress'));
    expect(p.onSelect).toHaveBeenCalledWith('block:deployments.hello.ingress');
    expect(screen.queryByLabelText('deployments.hello.replicas')).toBeNull();   // no workload fields here
  });
  it('group panel: disabled state disables the switches', () => {
    render(<Inspector {...base(resolveSelection(g, groupId(dep.id))!)} disabled />);
    expect((screen.getByLabelText('toggle Service') as HTMLInputElement).disabled).toBe(true);
  });
  it('group panel: a focus token from "+ Add resource" focuses the first switch; none by default', () => {
    const p = base(resolveSelection(g, groupId(dep.id))!);
    const { unmount } = render(<Inspector {...p} focusToken={0} />);
    expect(document.activeElement).toBe(document.body);
    unmount();
    render(<Inspector {...p} focusToken={1} />);
    expect(document.activeElement).toBe(screen.getByLabelText('toggle Service'));
  });
  it('disabled state blocks edits and says why', () => {
    const p = { ...base(nodeSel(dep)), disabled: true };
    render(<Inspector {...p} />);
    expect(screen.getByText(/fix the YAML/i)).toBeTruthy();
    expect((document.querySelector('.inspector fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  });
});
