// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AddKeyRow } from '../src/inspector/fields/AddKeyRow';

afterEach(cleanup);
const dns = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

describe('AddKeyRow', () => {
  it('existing behaviour: empty disables, duplicate says already exists, pattern miss shows invalidText', () => {
    const onAdd = vi.fn();
    render(<AddKeyRow id="x" existing={['web']} valid={(k) => dns.test(k)} invalidText="must match dns" onAdd={onAdd} inputAriaLabel="Name" buttonAriaLabel="Add" />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    const button = screen.getByLabelText('Add') as HTMLButtonElement;
    expect(input.value).toBe('');
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'web' } });
    expect(screen.getByText('already exists')).toBeTruthy();
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'Web' } });
    expect(screen.getByText('must match dns')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'api' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onAdd).toHaveBeenCalledWith('api');
    expect(input.value).toBe('');
  });
  it('initial prefills, focuses and selects the input; onDraft reports the trimmed draft', () => {
    const onDraft = vi.fn();
    render(<AddKeyRow id="x" existing={[]} valid={() => true} invalidText="" onAdd={vi.fn()} inputAriaLabel="Name" initial="backend-api" onDraft={onDraft} />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    expect(input.value).toBe('backend-api');
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('backend-api'.length);
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(input, { target: { value: '  api  ' } });
    expect(onDraft).toHaveBeenLastCalledWith('api');
  });
  it('a changed initial on a mounted row is ignored (mount-only seed)', () => {
    const { rerender } = render(<AddKeyRow id="x" existing={[]} valid={() => true} invalidText="" onAdd={vi.fn()} inputAriaLabel="Name" initial="one" />);
    rerender(<AddKeyRow id="x" existing={[]} valid={() => true} invalidText="" onAdd={vi.fn()} inputAriaLabel="Name" initial="two" />);
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('one');
  });
  it('without initial nothing is focused on mount', () => {
    render(<AddKeyRow id="x" existing={[]} valid={() => true} invalidText="" onAdd={vi.fn()} inputAriaLabel="Name" />);
    expect(document.activeElement).not.toBe(screen.getByLabelText('Name'));
  });
});
