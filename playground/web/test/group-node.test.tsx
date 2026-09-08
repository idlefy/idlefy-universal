// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { GroupNode } from '../src/canvas/GroupNode';
import { CanvasActions } from '../src/canvas/actions';

afterEach(cleanup);
const data = { label: 'Deployment hello', kind: 'Deployment', name: 'hello', ownerId: 'default/Deployment/hello' };
const props = (selected: boolean) => ({ id: 'group:default/Deployment/hello', data, selected, type: 'group' } as any);

describe('GroupNode', () => {
  it('renders the header with a title button and an add pill; selected class follows the prop', () => {
    const { container, rerender } = render(<GroupNode {...props(false)} />);
    expect(container.querySelector('.rgroup.selected')).toBeNull();
    expect(screen.getByLabelText('Open group Deployment hello').textContent).toContain('hello');
    expect(screen.getByLabelText('Add resource to Deployment hello').textContent).toBe('+ Add resource');
    rerender(<GroupNode {...props(true)} />);
    expect(container.querySelector('.rgroup.selected')).toBeTruthy();
  });
  it('title selects the group, the pill selects and asks to add', () => {
    const select = vi.fn(), addResource = vi.fn();
    render(<CanvasActions.Provider value={{ select, addResource }}><GroupNode {...props(false)} /></CanvasActions.Provider>);
    fireEvent.click(screen.getByLabelText('Open group Deployment hello'));
    expect(select).toHaveBeenCalledWith('group:default/Deployment/hello');
    fireEvent.click(screen.getByLabelText('Add resource to Deployment hello'));
    expect(addResource).toHaveBeenCalledWith('group:default/Deployment/hello');
  });
  it('header buttons opt out of React Flow drag and pan', () => {
    render(<GroupNode {...props(false)} />);
    for (const b of screen.getAllByRole('button')) expect(b.className).toMatch(/\bnodrag\b/);
  });
  it('the add-resource pill does not bubble its click to a parent handler', () => {
    const spy = vi.fn();
    render(<div onClick={spy}><GroupNode {...props(false)} /></div>);
    fireEvent.click(screen.getByLabelText('Add resource to Deployment hello'));
    expect(spy).not.toHaveBeenCalled();
  });
});
