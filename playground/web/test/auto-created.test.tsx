// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AutoCreated } from '../src/inspector/AutoCreated';

afterEach(cleanup);
const props = (kindKey: string, cfg: Record<string, any>, extra: Partial<Parameters<typeof AutoCreated>[0]> = {}) => ({
  kindKey, name: 'api', base: [kindKey, 'api'], cfg, disabled: false, onEdit: vi.fn(), nodeFor: () => null, onSelect: vi.fn(), ...extra,
});

describe('AutoCreated', () => {
  it('explains a blocking condition even while the switch reads on', () => {
    const p = props('deployments', { autoCreateService: true, containers: { main: { image: 'x' } } });
    render(<AutoCreated {...p} />);
    const sw = screen.getByLabelText('toggle Service') as HTMLInputElement;
    expect(sw.checked).toBe(true);
    expect(sw.disabled).toBe(false);
    expect(screen.getByText(/add a container port first/i)).toBeTruthy();
    fireEvent.click(sw);
    expect(p.onEdit).toHaveBeenCalledWith([{ op: 'set', path: ['deployments', 'api', 'autoCreateService'], value: false }]);
  });
  it('blocks switching a blocked switch on and shows the reason', () => {
    render(<AutoCreated {...props('deployments', { containers: { main: { image: 'x' } } })} />);
    const sw = screen.getByLabelText('toggle Service') as HTMLInputElement;
    expect(sw.checked).toBe(false);
    expect(sw.disabled).toBe(true);
    expect(screen.getByText(/add a container port first/i)).toBeTruthy();
  });
  it('shows a summary when on, a hint when off, and opens the node', () => {
    const p = props('deployments', { autoCreateRbac: true, rbac: { rules: [{}] } }, { nodeFor: (id) => (id === 'rbac' ? 'default/Role/api' : null) });
    render(<AutoCreated {...p} />);
    expect(screen.getByText('1 rule')).toBeTruthy();
    expect(screen.getAllByText('needs Service').length).toBeGreaterThan(0); // Ingress, HTTPRoute and ServiceMonitor are off
    fireEvent.click(screen.getByLabelText('open Role + RoleBinding'));
    expect(p.onSelect).toHaveBeenCalledWith('default/Role/api');
    expect(screen.queryByLabelText('open Ingress')).toBeNull();
  });
  it('shows no warning line when nothing blocks the switch', () => {
    render(<AutoCreated {...props('deployments', { autoCreateService: true, containers: { main: { image: 'x', ports: { http: { containerPort: 80 } } } } })} />);
    expect(document.querySelectorAll('.sub.why').length).toBe(0);
  });
  it('renders the block inline when the switch is on but the graph has no node for it', () => {
    const p = props('deployments', { hpa: { minReplicas: 1, maxReplicas: 3 } }, { renderBlock: (id) => <div data-testid={`block-${id}`} /> });
    render(<AutoCreated {...p} />);
    expect(screen.getByTestId('block-hpa')).toBeTruthy();       // on, no node → inline
    expect(screen.queryByTestId('block-ingress')).toBeNull();   // off → nothing
  });
  it('orders rows by the spec and only lists applicable ones', () => {
    render(<AutoCreated {...props('statefulSets', {})} />);
    const labels = screen.getAllByRole('switch').map((e) => e.getAttribute('aria-label'));
    expect(labels).toEqual(['toggle Service', 'toggle PodDisruptionBudget', 'toggle ServiceMonitor', 'toggle NetworkPolicy', 'toggle ServiceAccount', 'toggle Role + RoleBinding']);
  });
});
