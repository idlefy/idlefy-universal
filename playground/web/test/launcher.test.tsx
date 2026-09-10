// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import schema from '../src/chart-bundle/schema.json';
import { Launcher } from '../src/palette/Launcher';
import { NameStep } from '../src/palette/NameStep';
import { ENTITIES, entityOf } from '../src/graph/entities';

afterEach(cleanup);
const root = schema as any;
const setup = (values: Record<string, unknown> = {}, initialKey?: string) => {
  const onAdd = vi.fn(), onClose = vi.fn();
  render(<Launcher root={root} values={values} initialKey={initialKey} onAdd={onAdd} onClose={onClose} />);
  return { onAdd, onClose };
};
const options = () => screen.getAllByRole('option').map((o) => o.textContent);
const active = () => screen.getAllByRole('option').findIndex((o) => o.getAttribute('aria-selected') === 'true');

describe('Launcher', () => {
  it('step 1 renders all 11 rows in table order under two headings, search autofocused', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Add a resource' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Search resources'));
    expect(screen.getAllByRole('option')).toHaveLength(11);
    for (const [i, e] of ENTITIES.entries()) expect(options()[i]).toContain(e.label);
    expect(screen.getByText('WORKLOADS')).toBeTruthy();
    expect(screen.getByText('RESOURCES')).toBeTruthy();
    expect(active()).toBe(0);
  });
  it('filters case-insensitively on label/key/kind/description and drops empty headings', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'DEP' } });
    expect(options()).toHaveLength(1);
    expect(options()[0]).toContain('Deployment');
    expect(screen.queryByText('RESOURCES')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'gateway' } });   // description of httpRoutes
    expect(options()[0]).toContain('HTTPRoute');
    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No resource matches "zzz"')).toBeTruthy();
  });
  it('arrows move the active row and wrap; hover moves it; Esc closes', () => {
    const { onClose } = setup();
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'ArrowUp' });
    expect(active()).toBe(10);
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    expect(active()).toBe(0);
    fireEvent.mouseEnter(screen.getAllByRole('option')[3]);
    expect(active()).toBe(3);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('Enter opens step 2 with the unique default name selected; Esc returns to step 1 with the query kept', () => {
    setup({ deployments: { 'backend-api': {} } });
    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'dep' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(screen.getByText('New Deployment')).toBeTruthy();
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.value).toBe('backend-api-2');
    expect(document.activeElement).toBe(name);
    expect(screen.getByText('Inserted from the schema example')).toBeTruthy();
    expect(document.querySelector('.launcher pre')!.textContent).toContain('backend-api-2:');
    expect(screen.getByText('Lowercase letters, digits and dashes (DNS label).')).toBeTruthy();   // deployments has propertyNames.pattern = the DNS label
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect((screen.getByLabelText('Search resources') as HTMLInputElement).value).toBe('dep');
    expect(options()).toHaveLength(1);
  });
  it('duplicate and invalid names disable Add and Enter; a valid Enter adds once', () => {
    const { onAdd, onClose } = setup({ jobs: { migrate: {} } });
    fireEvent.click(screen.getByRole('option', { name: /^Job/ }));   // anchored: /Job/ would also match CronJob ("Job on a schedule")
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'migrate' } });
    expect(screen.getByText('already exists')).toBeTruthy();
    expect((screen.getByLabelText('Add Job') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: 'Bad Name' } });
    expect((screen.getByLabelText('Add Job') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(name, { target: { value: 'cleanup' } });
    expect(document.querySelector('.launcher pre')!.textContent).toContain('cleanup:');
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith('jobs', 'cleanup');
    expect(onClose).not.toHaveBeenCalled();   // closing is the owner's job (AddButton)
  });
  it('the Add button adds too; initialKey opens directly in step 2; the back button returns', () => {
    const { onAdd } = setup({}, 'deployments');
    expect(screen.getByText('New Deployment')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Add Deployment'));
    expect(onAdd).toHaveBeenCalledWith('deployments', 'backend-api');
    fireEvent.click(screen.getByLabelText('Back to the list'));
    expect(screen.getByLabelText('Search resources')).toBeTruthy();
  });
  it('preview follows the name for name-aware starters', () => {
    setup({}, 'ingresses');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'shop' } });
    expect(document.querySelector('.launcher pre')!.textContent).toContain('host: shop.example.com');
  });
  it('a workload name already used by another workload map is rejected', () => {
    const onAdd = vi.fn();
    render(<NameStep root={root} entity={entityOf('jobs')!} values={{ deployments: { web: {} } }} onBack={vi.fn()} onAdd={onAdd} />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'web' } });
    // _validation.tpl: "Workload key 'web' appears in multiple top-level keys: deployments, jobs."
    expect(screen.getByText('already exists')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Add Job' }) as HTMLButtonElement).disabled).toBe(true);
    // a standalone resource is still scoped to its own map
    cleanup();
    render(<NameStep root={root} entity={entityOf('configs')!} values={{ deployments: { web: {} } }} onBack={vi.fn()} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'web' } });
    expect(screen.queryByText('already exists')).toBeNull();
  });
});
