// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Toggles } from '../src/inspector/Toggles';

afterEach(cleanup);
const props = (kindKey: string, cfg: Record<string, any>, onEdit = vi.fn()) => ({
  kindKey, name: 'api', base: [kindKey, 'api'], cfg, disabled: false, onEdit,
});

describe('Toggles', () => {
  // The flag is on but the chart renders nothing (autoCreateServicePortsList is empty), so the graph
  // shows no Service node. The toggle must say why instead of silently disagreeing with the canvas.
  it('explains a blocking condition even while the toggle reads on', () => {
    const p = props('deployments', { autoCreateService: true, containers: { main: { image: 'x' } } });
    render(<Toggles {...p} />);
    const box = screen.getByLabelText('toggle Service') as HTMLInputElement;
    expect(box.checked).toBe(true);
    // switching it back off must stay possible
    expect(box.disabled).toBe(false);
    expect(screen.getByText(/add a container port first/i)).toBeTruthy();
    fireEvent.click(box);
    expect(p.onEdit).toHaveBeenCalledWith([{ op: 'set', path: ['deployments', 'api', 'autoCreateService'], value: false }]);
  });
  it('still blocks switching a blocked toggle on', () => {
    render(<Toggles {...props('deployments', { containers: { main: { image: 'x' } } })} />);
    const box = screen.getByLabelText('toggle Service') as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect(screen.getByText(/add a container port first/i)).toBeTruthy();
  });
  it('shows no reason when nothing blocks the toggle', () => {
    render(<Toggles {...props('deployments', { autoCreateService: true, containers: { main: { image: 'x', ports: { http: { containerPort: 80 } } } } })} />);
    expect((screen.getByLabelText('toggle Service') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText(/add a container port first/i)).toBeNull();
  });
});
