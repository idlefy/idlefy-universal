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
const cnode = schemaAt(root, cbase)!;

describe('ObjectListField', () => {
  it('env: pair rows with an identifying input, a value input, remove and add', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={cnode} basePath={cbase} value={{ image: 'x', env: [{ name: 'A', value: '1' }, { name: 'B', value: '2' }] }} tier="basic" onEdit={onEdit} />);
    const nameA = screen.getByLabelText('deployments.web.containers.main.env.0.name') as HTMLInputElement;
    expect(nameA.value).toBe('A');
    expect(nameA.className).toContain('var');
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.env.1.value'), { target: { value: '3' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...cbase, 'env', 1, 'value'], value: '3' }]);
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.env.1.value'), { target: { value: '' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: [...cbase, 'env', 1, 'value'] }]);
    fireEvent.click(screen.getByLabelText('remove deployments.web.containers.main.env.0'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: [...cbase, 'env', 0] }]);
    // a required identifying leaf is never deleted while typing: it is set to ''
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.env.0.name'), { target: { value: '' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...cbase, 'env', 0, 'name'], value: '' }]);
    const add = screen.getByLabelText('add deployments.web.containers.main.env');
    expect(add.textContent).toBe('Variable');
    fireEvent.click(add);
    const ops = onEdit.mock.calls.at(-1)![0];
    expect(ops[0].path).toEqual([...cbase, 'env', 2]);   // append by index, not whole-array rewrite
    expect(ops[0].value).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'deployments.web.containers.main.env' })).toBeNull();   // no textarea
  });
  it('env: the expander offers valueFrom only when `value` is unset (EnvVar is a oneOf)', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={cnode} basePath={cbase} value={{ image: 'x', env: [{ name: 'A', value: '1' }, { name: 'B' }, { name: 'S', valueFrom: { secretKeyRef: { name: 'db', key: 'pw' } } }] }} tier="basic" onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText('more deployments.web.containers.main.env.0'));
    // row 0 has `value`, so adding `valueFrom` would match both oneOf branches
    expect(screen.queryByLabelText('add field deployments.web.containers.main.env.0.valueFrom')).toBeNull();
    fireEvent.click(screen.getByLabelText('more deployments.web.containers.main.env.1'));
    expect(screen.getByLabelText('add field deployments.web.containers.main.env.1.valueFrom')).toBeTruthy();
    expect(screen.getByLabelText('deployments.web.containers.main.env.2.valueFrom.secretKeyRef.name')).toBeTruthy();
  });
  it('secretRefs-shaped pair: nested leaves render as a joined pair, name before key; optional sits behind the expander', () => {
    const onEdit = vi.fn();
    const node = { type: 'object', properties: { refs: { type: 'array', items: root.$defs.SecretRefEntry } } };
    render(<FieldList root={root} node={node} basePath={['x']} value={{ refs: [{ name: 'API_KEY', secretKeyRef: { name: 's', key: 'k' } }] }} tier="basic" onEdit={onEdit} />);
    const pair = document.querySelector('.pair')!;
    expect([...pair.querySelectorAll('input')].map((i) => i.getAttribute('aria-label'))).toEqual(['x.refs.0.secretKeyRef.name', 'x.refs.0.secretKeyRef.key']);
    fireEvent.change(screen.getByLabelText('x.refs.0.secretKeyRef.key'), { target: { value: 'k2' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['x', 'refs', 0, 'secretKeyRef', 'key'], value: 'k2' }]);
    fireEvent.click(screen.getByLabelText('more x.refs.0'));
    expect(screen.getByLabelText('add field x.refs.0.secretKeyRef.optional')).toBeTruthy();
  });
  it('secretRefs-shaped pair: the expander body shows only the extra sub-key, not the leaves the row already edits', () => {
    const onEdit = vi.fn();
    const node = { type: 'object', properties: { refs: { type: 'array', items: root.$defs.SecretRefEntry } } };
    render(<FieldList root={root} node={node} basePath={['x']} value={{ refs: [{ name: 'API_KEY', secretKeyRef: { name: 's', key: 'k' } }] }} tier="basic" onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText('more x.refs.0'));
    expect(screen.getAllByLabelText('x.refs.0.secretKeyRef.name')).toHaveLength(1);
    expect(screen.queryByLabelText('clear x.refs.0.secretKeyRef')).toBeNull();
    expect(screen.getByLabelText('add field x.refs.0.secretKeyRef.optional')).toBeTruthy();
    expect(screen.queryByText('No fields here.')).toBeNull();
  });
  it('oneOf-exclusive leaves: setting subdomain deletes host and vice versa; other pairs are untouched', () => {
    const onEdit = vi.fn();
    const hostnames = schemaAt(root, ['deployments', 'web', 'httpRoute'])!;
    const hbase = [...base, 'httpRoute'];
    render(<FieldList root={root} node={hostnames} basePath={hbase} value={{ hostnames: [{ host: 'a.example.com' }, { subdomain: 'api' }] }} tier="basic" onEdit={onEdit} />);
    fireEvent.change(screen.getByLabelText('deployments.web.httpRoute.hostnames.0.subdomain'), { target: { value: 'shop' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...hbase, 'hostnames', 0, 'subdomain'], value: 'shop' }, { op: 'delete', path: [...hbase, 'hostnames', 0, 'host'] }]);
    fireEvent.change(screen.getByLabelText('deployments.web.httpRoute.hostnames.1.host'), { target: { value: 'b.example.com' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...hbase, 'hostnames', 1, 'host'], value: 'b.example.com' }, { op: 'delete', path: [...hbase, 'hostnames', 1, 'subdomain'] }]);
    // no sibling present → a plain set
    fireEvent.change(screen.getByLabelText('deployments.web.httpRoute.hostnames.1.subdomain'), { target: { value: 'api2' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...hbase, 'hostnames', 1, 'subdomain'], value: 'api2' }]);
  });
  it('a present non-list value keeps the raw YAML editor', () => {
    render(<FieldList root={root} node={cnode} basePath={cbase} value={{ image: 'x', env: { NOT: 'a list' } }} tier="basic" onEdit={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('edit deployments.web.containers.main.env as YAML'));
    expect(screen.getByLabelText('deployments.web.containers.main.env').tagName).toBe('TEXTAREA');
  });
  it('tolerations: block rows collapsed with the identifying value, expand shows the item fields', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={{ tolerations: [{ key: 'gpu', operator: 'Exists', effect: 'NoSchedule' }] }} tier="advanced" onEdit={onEdit} />);
    expect(document.querySelector('.olist .field.block .field-head')!.textContent).toContain('gpu');
    expect(screen.queryByLabelText('deployments.web.tolerations.0.operator')).toBeNull();
    fireEvent.click(screen.getByLabelText('expand deployments.web.tolerations.0'));
    fireEvent.change(screen.getByLabelText('deployments.web.tolerations.0.operator'), { target: { value: 'Equal' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...base, 'tolerations', 0, 'operator'], value: 'Equal' }]);
    expect(screen.getByLabelText('add deployments.web.tolerations').textContent).toBe('Toleration');
  });
  it('pair leaves: an enum leaf is a select, a number leaf emits numbers and ignores junk, an optional leaf empties to delete', () => {
    const onEdit = vi.fn();
    const node = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, kind: { type: 'string', enum: ['a', 'b'] }, port: { type: 'integer' } } } } } };
    render(<FieldList root={root} node={node} basePath={['x']} value={{ items: [{ name: 'n', kind: 'a', port: 1 }] }} tier="basic" onEdit={onEdit} />);
    const kind = screen.getByLabelText('x.items.0.kind') as HTMLSelectElement;
    expect(kind.tagName).toBe('SELECT');
    fireEvent.change(kind, { target: { value: 'b' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['x', 'items', 0, 'kind'], value: 'b' }]);
    fireEvent.change(screen.getByLabelText('x.items.0.port'), { target: { value: '8080' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['x', 'items', 0, 'port'], value: 8080 }]);
    onEdit.mockClear();
    fireEvent.change(screen.getByLabelText('x.items.0.port'), { target: { value: 'abc' } });
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('x.items.0.port'), { target: { value: '' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: ['x', 'items', 0, 'port'] }]);
  });
  it('pair leaves: an integer leaf rejects a decimal (no edit, invalid class) and accepts a whole number', () => {
    const onEdit = vi.fn();
    const node = { type: 'object', properties: { items: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, port: { type: 'integer' } } } } } };
    const { rerender } = render(<FieldList root={root} node={node} basePath={['x']} value={{ items: [{ name: 'n', port: 1 }] }} tier="basic" onEdit={onEdit} />);
    const port = screen.getByLabelText('x.items.0.port') as HTMLInputElement;
    fireEvent.change(port, { target: { value: '8.5' } });
    expect(onEdit).not.toHaveBeenCalled();
    expect(port.className).toContain('invalid');
    // a parent re-render with a fresh but equal value (every render's toJS() is a new object) keeps the draft
    rerender(<FieldList root={root} node={node} basePath={['x']} value={{ items: [{ name: 'n', port: 1 }] }} tier="basic" onEdit={onEdit} />);
    expect(port.value).toBe('8.5');
    expect(port.className).toContain('invalid');
    // a real change of the committed value drops it
    rerender(<FieldList root={root} node={node} basePath={['x']} value={{ items: [{ name: 'n', port: 2 }] }} tier="basic" onEdit={onEdit} />);
    expect(port.value).toBe('2');
    expect(port.className).not.toContain('invalid');
    fireEvent.change(port, { target: { value: '85' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['x', 'items', 0, 'port'], value: 85 }]);
    expect(port.className).not.toContain('invalid');
  });
  it('expansion state follows the item after a removal', () => {
    const onEdit = vi.fn();
    // rows with no `value` set, so `valueFrom` is still offered — this test uses that chip as its
    // "row is open" probe, and buildFields now hides it while the other half of the oneOf is set
    const value = { image: 'x', env: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] };
    const { rerender } = render(<FieldList root={root} node={cnode} basePath={cbase} value={value} tier="basic" onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText('more deployments.web.containers.main.env.2'));   // C open
    fireEvent.click(screen.getByLabelText('remove deployments.web.containers.main.env.0'));
    rerender(<FieldList root={root} node={cnode} basePath={cbase} value={{ image: 'x', env: value.env.slice(1) }} tier="basic" onEdit={onEdit} />);
    expect(screen.getByLabelText('add field deployments.web.containers.main.env.1.valueFrom')).toBeTruthy();   // C, now index 1, still open
    expect(screen.queryByLabelText('add field deployments.web.containers.main.env.0.valueFrom')).toBeNull();     // B stays closed
  });
  it('a required-but-absent list still renders (no rows) and adding the first item creates the array', () => {
    const onEdit = vi.fn();
    const node = { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } };
    render(<FieldList root={root} node={node} basePath={['x']} value={{}} tier="basic" onEdit={onEdit} />);
    expect(screen.queryByLabelText('x.items.0.name')).toBeNull();
    fireEvent.click(screen.getByLabelText('add x.items'));
    const ops = onEdit.mock.calls.at(-1)![0];
    expect(ops[0].path).toEqual(['x', 'items', 0]);
    expect(ops[0].value).toEqual({ name: '' });
  });
  it('the last item of a locked list cannot be removed', () => {
    const onEdit = vi.fn();
    const ing = schemaAt(root, ['ingresses', 'site'])!;
    render(<FieldList root={root} node={ing} basePath={['ingresses', 'site']} value={{ hosts: [{ host: 'a.example.com', paths: [{ path: '/', pathType: 'Prefix' }] }] }} tier="advanced" onEdit={onEdit} />);
    // removing it would delete `hosts` and leave `ingresses.site: {}` — "configuration must not be empty"
    expect((screen.getByLabelText('remove ingresses.site.hosts.0') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('remove ingresses.site.hosts.0'));
    expect(onEdit).not.toHaveBeenCalled();
  });
});
