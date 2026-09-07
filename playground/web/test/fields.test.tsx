// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import schema from '../src/chart-bundle/schema.json';
import { FieldList } from '../src/inspector/fields';
import { schemaAt } from '../src/inspector/schema';

const root = schema as any;
afterEach(cleanup);
const dep = schemaAt(root, ['deployments', 'web'])!;
const base = ['deployments', 'web'];
const cbase = [...base, 'containers', 'main'];

// chips beyond the cap sit behind a "+N more" chip; tests that look for a specific chip open it first
const showAllChips = () => screen.queryAllByRole('button', { name: /^show \d+ more fields$/ }).forEach((b) => fireEvent.click(b));

describe('field widgets', () => {
  it('number: change emits set, empty emits delete, junk emits nothing', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={{ replicas: 2 }} tier="advanced" onEdit={onEdit} />);
    const input = screen.getByLabelText('deployments.web.replicas') as HTMLInputElement;
    expect(input.value).toBe('2');
    fireEvent.change(input, { target: { value: '5' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'replicas'], value: 5 }]);
    fireEvent.change(input, { target: { value: '' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: [...base, 'replicas'] }]);
    onEdit.mockClear();
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('boolean and enum: absent fields are chips, present ones are controls', () => {
    const onEdit = vi.fn();
    const { rerender } = render(<FieldList root={root} node={dep} basePath={base} value={{}} tier="advanced" onEdit={onEdit} />);
    showAllChips();
    expect(screen.queryByLabelText('deployments.web.autoCreateSoftAntiAffinity')).toBeNull();
    fireEvent.click(screen.getByLabelText('add field deployments.web.autoCreateSoftAntiAffinity'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'autoCreateSoftAntiAffinity'], value: true }]);
    fireEvent.click(screen.getByLabelText('add field deployments.web.serviceType'));
    const st = onEdit.mock.calls.at(-1)![0][0];
    expect(st.op).toBe('set'); expect(st.path).toEqual([...base, 'serviceType']); expect(typeof st.value).toBe('string');
    rerender(<FieldList root={root} node={dep} basePath={base} value={{ autoCreateSoftAntiAffinity: true, serviceType: 'ClusterIP' }} tier="advanced" onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText('deployments.web.autoCreateSoftAntiAffinity'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'autoCreateSoftAntiAffinity'], value: false }]);
    fireEvent.change(screen.getByLabelText('deployments.web.serviceType'), { target: { value: 'NodePort' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'serviceType'], value: 'NodePort' }]);
  });

  it('order: listed keys first in the given order, others keep schema order', () => {
    render(<FieldList root={root} node={dep} basePath={base} value={{ replicas: 1, priorityClassName: 'x', strategy: { type: 'Recreate' } }} tier="advanced" onEdit={vi.fn()} order={['replicas', 'strategy']} />);
    const labels = [...document.querySelectorAll('.fields .field-head label')].map((l) => l.textContent!.replace('*', ''));
    expect(labels.slice(0, 2)).toEqual(['replicas', 'strategy']);
    expect(labels.indexOf('priorityClassName')).toBeGreaterThan(1);
  });

  it('chips: basic tier lists basic-tier absent fields only; advanced lists all', () => {
    const { rerender } = render(<FieldList root={root} node={dep} basePath={base} value={{}} tier="basic" onEdit={vi.fn()} />);
    showAllChips();
    expect(screen.getByLabelText('add field deployments.web.replicas')).toBeTruthy();
    expect(screen.queryByLabelText('add field deployments.web.priorityClassName')).toBeNull();
    rerender(<FieldList root={root} node={dep} basePath={base} value={{}} tier="advanced" onEdit={vi.fn()} />);
    showAllChips();
    expect(screen.getByLabelText('add field deployments.web.priorityClassName')).toBeTruthy();
    expect(screen.getByText(/^Add$/)).toBeTruthy();
  });

  it('chips: more than the cap collapse behind a "+N more" chip that reveals the rest', () => {
    render(<FieldList root={root} node={dep} basePath={base} value={{}} tier="advanced" onEdit={vi.fn()} />);
    const chipsBefore = document.querySelectorAll('.chip:not(.more)').length;
    const more = screen.getByRole('button', { name: /^show \d+ more fields$/ });
    expect(chipsBefore).toBe(8);
    fireEvent.click(more);
    expect(screen.queryByRole('button', { name: /^show \d+ more fields$/ })).toBeNull();
    expect(document.querySelectorAll('.chip').length).toBeGreaterThan(chipsBefore);
  });

  it('list: one item per line, trailing blank lines dropped', () => {
    const onEdit = vi.fn();
    const c = schemaAt(root, cbase)!;
    render(<FieldList root={root} node={c} basePath={cbase} value={{ image: 'x', imageTag: '1', args: ['a'] }} tier="advanced" onEdit={onEdit} />);
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.args'), { target: { value: 'migrate\nup\n' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...cbase, 'args'], value: ['migrate', 'up'] }]);
  });

  it('keyvalue: add, edit and remove rows', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={{ labels: { team: 'a' } }} tier="advanced" onEdit={onEdit} />);
    fireEvent.change(screen.getByLabelText('deployments.web.labels.team'), { target: { value: 'b' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'labels', 'team'], value: 'b' }]);
    fireEvent.click(screen.getByLabelText('remove deployments.web.labels.team'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: [...base, 'labels', 'team'] }]);
    fireEvent.change(screen.getByLabelText('new key deployments.web.labels'), { target: { value: 'tier' } });
    fireEvent.click(screen.getByLabelText('add deployments.web.labels'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'labels', 'tier'], value: '' }]);
  });

  it('keyvalue: leaves untouched scalars alone and re-types the value it edits', () => {
    const onEdit = vi.fn();
    const probe = schemaAt(root, [...cbase, 'probes', 'readinessProbe'])!;
    const pbase = [...cbase, 'probes', 'readinessProbe'];
    const g = [...pbase, 'grpc'];
    render(<FieldList root={root} node={probe} basePath={pbase} value={{ grpc: { port: 9090, service: 'my.pkg' } }} tier="advanced" onEdit={onEdit} />);
    const port = screen.getByLabelText([...g, 'port'].join('.')) as HTMLInputElement;
    expect(port.value).toBe('9090');
    // editing a neighbour emits one op only — `port: 9090` is never rewritten as a string
    fireEvent.change(screen.getByLabelText([...g, 'service'].join('.')), { target: { value: 'other.pkg' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...g, 'service'], value: 'other.pkg' }]);
    fireEvent.change(port, { target: { value: '9091' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...g, 'port'], value: 9091 }]);
    fireEvent.change(port, { target: { value: 'health' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...g, 'port'], value: 'health' }]);
    fireEvent.change(port, { target: { value: 'true' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...g, 'port'], value: true }]);
  });

  it('keyvalue: a string map keeps every edited value a string', () => {
    const onEdit = vi.fn();
    // nodeSelector/labels/annotations are Kubernetes string maps — the schema's own nodeSelector
    // example is {"node-role.kubernetes.io/worker": "true"} — so an unquoted true/2 must never be written.
    render(<FieldList root={root} node={dep} basePath={base} value={{ nodeSelector: { 'kubernetes.io/os': 'linux' } }} tier="advanced" onEdit={onEdit} />);
    const input = screen.getByLabelText('deployments.web.nodeSelector.kubernetes.io/os');
    fireEvent.change(input, { target: { value: 'true' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'nodeSelector', 'kubernetes.io/os'], value: 'true' }]);
    fireEvent.change(input, { target: { value: '2' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'nodeSelector', 'kubernetes.io/os'], value: '2' }]);
  });

  it('keyvalue: a map with no examples keeps every edited value a string', () => {
    const onEdit = vi.fn();
    const node = { type: 'object', properties: { extra: { type: 'object', additionalProperties: true } } };
    render(<FieldList root={root} node={node} basePath={['x']} value={{ extra: { a: 'b' } }} tier="advanced" onEdit={onEdit} />);
    fireEvent.change(screen.getByLabelText('x.extra.a'), { target: { value: '7' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['x', 'extra', 'a'], value: '7' }]);
  });

  it('keyvalue: falls back to the YAML editor when a value is not a scalar', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={{ labels: { team: { nested: 1 } } }} tier="advanced" onEdit={onEdit} />);
    const el = screen.getByLabelText('deployments.web.labels');
    expect(el.tagName).toBe('TEXTAREA');
    expect((el as HTMLTextAreaElement).value).toBe('team:\n  nested: 1\n');
  });

  it('string: an IntOrString field emits a number for digits and a string otherwise', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={{ pdb: { minAvailable: 1 } }} tier="basic" onEdit={onEdit} />);
    const input = screen.getByLabelText('deployments.web.pdb.minAvailable') as HTMLInputElement;
    expect(input.value).toBe('1');
    fireEvent.change(input, { target: { value: '2' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'pdb', 'minAvailable'], value: 2 }]);
    fireEvent.change(input, { target: { value: '50%' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'pdb', 'minAvailable'], value: '50%' }]);
    fireEvent.change(input, { target: { value: '' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: [...base, 'pdb', 'minAvailable'] }]);
  });

  it('yaml: valid YAML emits set on blur, invalid shows an error and emits nothing', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={{ tolerations: [{ key: 'a' }] }} tier="advanced" onEdit={onEdit} />);
    const ta = screen.getByLabelText('deployments.web.tolerations') as HTMLTextAreaElement;
    expect(ta.value).toBe('- key: a\n');
    fireEvent.change(ta, { target: { value: '- key: b\n  operator: Exists\n' } });
    fireEvent.blur(ta);
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'tolerations'], value: [{ key: 'b', operator: 'Exists' }] }]);
    onEdit.mockClear();
    fireEvent.change(ta, { target: { value: '- [\n' } });
    fireEvent.blur(ta);
    expect(onEdit).not.toHaveBeenCalled();
    // anchored to the error span: every YamlField also renders permanent help text containing "YAML"
    expect(screen.getByText(/^YAML: /)).toBeTruthy();
  });

  it('map: lists entries, adds a starter entry, rejects duplicate keys', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={{ containers: { main: { image: 'x', imageTag: '1' } } }} tier="basic" onEdit={onEdit} />);
    expect(screen.getByText('main')).toBeTruthy();
    // `containers` has no propertyNames in the schema; the key pattern branch is exercised by keyPattern-bearing maps only.
    fireEvent.change(screen.getByLabelText('new key deployments.web.containers'), { target: { value: 'main' } });
    expect((screen.getByLabelText('add deployments.web.containers') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('new key deployments.web.containers'), { target: { value: 'sidecar' } });
    fireEvent.click(screen.getByLabelText('add deployments.web.containers'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'containers', 'sidecar'], value: expect.objectContaining({ image: expect.any(String) }) }]);
    fireEvent.click(screen.getByLabelText('remove deployments.web.containers.main'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: [...base, 'containers', 'main'] }]);
  });

  it('object section: nested fields render with full paths and a clear button deletes the block', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={{ pdb: { minAvailable: 1 } }} tier="basic" onEdit={onEdit} />);
    expect(screen.getByLabelText('deployments.web.pdb.minAvailable')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('clear deployments.web.pdb'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: [...base, 'pdb'] }]);
  });
});
