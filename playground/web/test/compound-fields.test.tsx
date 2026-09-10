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
const c = [...base, 'containers', 'main'];
const value = { containers: { main: { image: 'nginx', imageTag: '1.27', resources: { requests: { cpu: '10m' } }, ports: { http: { containerPort: 80, servicePort: 80 } } } } };

describe('compound widgets', () => {
  it('renders one card per container with image:tag on one row', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={value} tier="basic" onEdit={onEdit} />);
    expect(document.querySelectorAll('.card').length).toBe(1);
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.image'), { target: { value: 'httpd' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...c, 'image'], value: 'httpd' }]);
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.imageTag'), { target: { value: '2' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...c, 'imageTag'], value: '2' }]);
    // absent container fields are chips inside the card
    expect(screen.getByLabelText('add field deployments.web.containers.main.env')).toBeTruthy();
    // the sole container's remove is disabled — `containers: {}` renders `containers: null`
    expect((screen.getByLabelText('remove deployments.web.containers.main') as HTMLButtonElement).disabled).toBe(true);
  });
  it('adds a container with a validated name and the starter value', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={value} tier="basic" onEdit={onEdit} />);
    const box = screen.getByLabelText('new key deployments.web.containers');
    fireEvent.change(box, { target: { value: 'Bad Name' } });
    expect((screen.getByLabelText('add deployments.web.containers') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: 'sidecar' } });
    fireEvent.click(screen.getByLabelText('add deployments.web.containers'));
    const ops = onEdit.mock.calls.at(-1)![0];
    expect(ops[0].op).toBe('set');
    expect(ops[0].path).toEqual([...base, 'containers', 'sidecar']);
    expect(ops[0].value).toHaveProperty('image');
  });
  it('resources grid sets leaves and deletes emptied ones', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={value} tier="basic" onEdit={onEdit} />);
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.resources.limits.memory'), { target: { value: '128Mi' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...c, 'resources', 'limits', 'memory'], value: '128Mi' }]);
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.resources.requests.cpu'), { target: { value: '' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: [...c, 'resources', 'requests', 'cpu'] }]);
  });
  it('ports table edits, adds and removes ports', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={value} tier="basic" onEdit={onEdit} />);
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.ports.http.containerPort'), { target: { value: '8080' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...c, 'ports', 'http', 'containerPort'], value: 8080 }]);
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.ports.http.protocol'), { target: { value: 'UDP' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...c, 'ports', 'http', 'protocol'], value: 'UDP' }]);
    fireEvent.change(screen.getByLabelText('deployments.web.containers.main.ports.http.servicePort'), { target: { value: '' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: [...c, 'ports', 'http', 'servicePort'] }]);
    fireEvent.change(screen.getByLabelText('new port name deployments.web.containers.main.ports'), { target: { value: 'metrics' } });
    fireEvent.click(screen.getByLabelText('add port deployments.web.containers.main.ports'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...c, 'ports', 'metrics'], value: { containerPort: 8080 } }]);
    fireEvent.click(screen.getByLabelText('remove deployments.web.containers.main.ports.http'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: [...c, 'ports', 'http'] }]);
  });
  it('ports table: containerPort is 1…65535 and never deleted; the add row picks a free number', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={value} tier="basic" onEdit={onEdit} />);
    const cp = screen.getByLabelText('deployments.web.containers.main.ports.http.containerPort') as HTMLInputElement;
    onEdit.mockClear();
    fireEvent.change(cp, { target: { value: '0' } });          // PortSpec.containerPort has minimum: 1
    expect(onEdit).not.toHaveBeenCalled();
    expect(cp.className).toContain('invalid');
    fireEvent.change(cp, { target: { value: '70000' } });       // maximum: 65535
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.change(cp, { target: { value: '' } });            // required by PortSpec
    expect(onEdit).not.toHaveBeenCalled();
    expect(cp.value).toBe('');
    fireEvent.change(cp, { target: { value: '9090' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...c, 'ports', 'http', 'containerPort'], value: 9090 }]);
  });
  it('ports table: the add row does not repeat a containerPort the container already uses', () => {
    const onEdit = vi.fn();
    const taken = { containers: { main: { image: 'n', imageTag: '1', ports: { http: { containerPort: 8080 } } } } };
    render(<FieldList root={root} node={dep} basePath={base} value={taken} tier="basic" onEdit={onEdit} />);
    fireEvent.change(screen.getByLabelText('new port name deployments.web.containers.main.ports'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByLabelText('add port deployments.web.containers.main.ports'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...c, 'ports', 'admin'], value: { containerPort: 8081 } }]);
  });
  it('image and tag are held, not deleted, when a box is emptied', () => {
    const onEdit = vi.fn();
    render(<FieldList root={root} node={dep} basePath={base} value={value} tier="basic" onEdit={onEdit} />);
    const img = screen.getByLabelText('deployments.web.containers.main.image') as HTMLInputElement;
    fireEvent.change(img, { target: { value: '' } });
    expect(onEdit).not.toHaveBeenCalled();
    expect(img.value).toBe('');
    expect(img.className).toContain('invalid');
    fireEvent.change(img, { target: { value: 'httpd' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: [...c, 'image'], value: 'httpd' }]);
  });
});
