// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EmptyState } from '../src/palette/EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
  it('shows the copy and routes both buttons', () => {
    const onAddDeployment = vi.fn(), onLoadExample = vi.fn();
    const { container } = render(<EmptyState onAddDeployment={onAddDeployment} onLoadExample={onLoadExample} />);
    expect(container.querySelector('.empty > .empty-card')).toBeTruthy();
    expect(screen.getByText('Nothing to render yet')).toBeTruthy();
    expect(screen.getByText('Add a workload, or start from an example.')).toBeTruthy();
    expect(screen.getByText('values.yaml has no workloads, so the chart renders no objects.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a Deployment' }));
    expect(onAddDeployment).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Load an example' }));
    expect(onLoadExample).toHaveBeenCalledTimes(1);
  });
});
