// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AutoCreated } from '../src/inspector/AutoCreated';

afterEach(cleanup);
const props = (kindKey: string, cfg: Record<string, any>, extra: Partial<Parameters<typeof AutoCreated>[0]> = {}) => ({
  kindKey, name: 'api', base: [kindKey, 'api'], cfg, disabled: false, onEdit: vi.fn(), nodeFor: () => null, hasSchema: (id: string) => id !== 'service', onSelect: vi.fn(), ...extra,
});

describe('AutoCreated', () => {
  it('explains a blocking condition even while the switch reads on', () => {
    const p = props('deployments', { autoCreateService: true, containers: { main: { image: 'x' } } });
    render(<AutoCreated {...p} />);
    const sw = screen.getByLabelText('toggle Service') as HTMLInputElement;
    expect(sw.checked).toBe(true);
    expect(sw.disabled).toBe(false);
    // Service and ServiceMonitor share NEEDS_PORT, so the reason is on both rows
    expect(screen.getAllByText(/add a container port first/i).length).toBe(2);
    fireEvent.click(sw);
    expect(p.onEdit).toHaveBeenCalledWith([{ op: 'set', path: ['deployments', 'api', 'autoCreateService'], value: false }]);
  });
  it('blocks switching a blocked switch on and shows the reason', () => {
    render(<AutoCreated {...props('deployments', { containers: { main: { image: 'x' } } })} />);
    const sw = screen.getByLabelText('toggle Service') as HTMLInputElement;
    expect(sw.checked).toBe(false);
    expect(sw.disabled).toBe(true);
    // Service and ServiceMonitor share NEEDS_PORT, so the reason is on both rows
    expect(screen.getAllByText(/add a container port first/i).length).toBe(2);
  });
  it('shows a summary when on, a hint when off, and opens the node', () => {
    const p = props('deployments', { autoCreateRbac: true, rbac: { rules: [{}] } }, { nodeFor: (id) => (id === 'rbac' ? 'default/Role/api' : null) });
    render(<AutoCreated {...p} />);
    expect(screen.getByText('1 rule')).toBeTruthy();
    expect(screen.getAllByText('needs Service').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText('open Role + RoleBinding'));
    expect(p.onSelect).toHaveBeenCalledWith('default/Role/api');
  });
  it('shows no warning line when nothing blocks the switch', () => {
    render(<AutoCreated {...props('deployments', { autoCreateService: true, containers: { main: { image: 'x', ports: { http: { containerPort: 80 } } } } })} />);
    expect(document.querySelectorAll('.sub.why').length).toBe(0);
  });
  it('a block with a schema node but no rendered node opens as a block selection', () => {
    const p = props('deployments', { hpa: { minReplicas: 1, maxReplicas: 3 } });
    render(<AutoCreated {...p} />);
    fireEvent.click(screen.getByLabelText('open HorizontalPodAutoscaler'));
    expect(p.onSelect).toHaveBeenCalledWith('block:deployments.api.hpa');
    fireEvent.click(screen.getByLabelText('open Ingress'));
    expect(p.onSelect).toHaveBeenCalledWith('block:deployments.api.ingress');
  });
  it('the Service row (no schema node) opens only when its node exists', () => {
    const { rerender } = render(<AutoCreated {...props('deployments', { autoCreateService: true, containers: { main: { image: 'x', ports: { http: { containerPort: 80 } } } } })} />);
    expect(screen.queryByLabelText('open Service')).toBeNull();
    rerender(<AutoCreated {...props('deployments', { autoCreateService: true, containers: { main: { image: 'x', ports: { http: { containerPort: 80 } } } } }, { nodeFor: (id) => (id === 'service' ? 'default/Service/api' : null) })} />);
    expect(screen.getByLabelText('open Service')).toBeTruthy();
  });
  it('an off switch with a configured block says so', () => {
    render(<AutoCreated {...props('deployments', { autoCreateIngress: false, ingress: { hosts: [{ host: 'a.example.com' }] } })} />);
    expect((screen.getByLabelText('toggle Ingress') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('configured, not created')).toBeTruthy();
  });
  it('an off switch with an empty block shows the hint', () => {
    render(<AutoCreated {...props('deployments', { autoCreateIngress: false })} />);
    expect(screen.queryByText('configured, not created')).toBeNull();
    expect(screen.getAllByText('needs Service').length).toBeGreaterThan(0);
  });
  it('orders rows by the spec and only lists applicable ones', () => {
    render(<AutoCreated {...props('statefulSets', {})} />);
    const labels = screen.getAllByRole('switch').map((e) => e.getAttribute('aria-label'));
    expect(labels).toEqual(['toggle Service', 'toggle PodDisruptionBudget', 'toggle ServiceMonitor', 'toggle NetworkPolicy', 'toggle ServiceAccount', 'toggle Role + RoleBinding']);
  });
  it('a switch whose off direction is blocked is disabled and says why', () => {
    const cfg = { autoCreateRbac: true, autoCreateServiceAccount: true, rbac: { rules: [{}] }, containers: { main: { image: 'x', ports: { http: { containerPort: 80 } } } } };
    const p = props('deployments', cfg);
    render(<AutoCreated {...p} />);
    const sw = screen.getByLabelText('toggle ServiceAccount') as HTMLInputElement;
    expect(sw.checked).toBe(true);
    expect(sw.disabled).toBe(true);
    expect(screen.getByText(/turn Role \+ RoleBinding off first/i)).toBeTruthy();
    fireEvent.click(sw);
    expect(p.onEdit).not.toHaveBeenCalled();
  });
});
