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
  it('a typed draft is dropped when the placeholder reseeds under it (another add landed while open)', () => {
    const onAdd = vi.fn();
    const { rerender } = render(<NameStep root={root} entity={entityOf('deployments')!} values={{}} onBack={vi.fn()} onAdd={onAdd} />);
    const input = screen.getByLabelText('Name') as HTMLInputElement;
    expect(input.value).toBe('backend-api');
    fireEvent.change(input, { target: { value: 'web' } });
    expect(input.value).toBe('web');
    // simulate another add landing while this step stays mounted: 'backend-api' is now taken, so the
    // placeholder reseeds to 'backend-api-2' via uniqueName
    rerender(<NameStep root={root} entity={entityOf('deployments')!} values={{ deployments: { 'backend-api': {} } }} onBack={vi.fn()} onAdd={onAdd} />);
    const reseeded = screen.getByLabelText('Name') as HTMLInputElement;
    expect(reseeded.value).toBe('backend-api-2');
    // the stale typed draft ('web') must not still be what Enter would submit
    expect(document.querySelector('.launcher pre, .preview pre')!.textContent).toContain('backend-api-2:');
    fireEvent.keyDown(screen.getByText('New Deployment').closest('.name-step')!, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('backend-api-2');
  });
  it('scrolls the active row into view only on keyboard moves, never on hover or mount', () => {
    const seen: string[] = [];
    const scroll = vi.fn(function (this: Element) { seen.push(this.textContent ?? ''); });
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scroll;
    try {
      setup();
      expect(scroll).not.toHaveBeenCalled();                          // no scroll on mount
      fireEvent.mouseEnter(screen.getAllByRole('option')[3]);
      expect(active()).toBe(3);
      expect(scroll).not.toHaveBeenCalled();                          // hover moves the row but must not scroll
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' });
      expect(active()).toBe(4);
      expect(scroll).toHaveBeenCalled();
      expect(seen[seen.length - 1]).toContain('CronJob');
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
  it('is an announceable listbox: option ids, activedescendant, aria-modal', () => {
    setup();
    const input = screen.getByLabelText('Search resources');
    const list = screen.getByRole('listbox');
    const opts = screen.getAllByRole('option');
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(list.id).toBeTruthy();
    expect(opts[0].id).toBeTruthy();
    expect(input.getAttribute('aria-activedescendant')).toBe(opts[0].id);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);
  });
  it('Tab stays inside the dialog and the untrimmed query is not echoed', () => {
    setup();
    const input = screen.getByLabelText('Search resources') as HTMLInputElement;
    const ev = fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(ev).toBe(false);                              // preventDefault() was called
    expect(document.activeElement).toBe(input);          // the only focusable in step 1
    fireEvent.change(input, { target: { value: '  zzz  ' } });
    expect(screen.getByText('No resource matches "zzz"')).toBeTruthy();
  });
  it('the mousedown guard covers the whole dialog except the preview and focusable elements', () => {
    setup();
    const input = screen.getByLabelText('Search resources');
    const row = screen.getAllByRole('option')[0];
    expect(fireEvent.mouseDown(row)).toBe(false);          // default prevented: focus stays on the search box
    expect(document.activeElement).toBe(input);
    const keys = document.querySelector('.launcher .keys')!;
    expect(fireEvent.mouseDown(keys)).toBe(false);         // the key-hint footer is dialog padding, not selectable text
    cleanup();
    setup({}, 'ingresses');
    const pre = document.querySelector('.launcher pre')!;
    expect(fireEvent.mouseDown(pre)).toBe(true);           // preventDefault() was NOT called: a selection can start
  });
  it('a name that is only whitespace previews the invalid-name sentinel, not the last-valid preview', () => {
    const { onAdd } = setup({}, 'deployments');
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(document.querySelector('.launcher pre')!.textContent).toContain('backend-api:');
    fireEvent.change(name, { target: { value: '   ' } });
    expect((screen.getByLabelText('Add Deployment') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('.launcher pre')!.textContent).toBe('Type a valid name to preview the insert.');
    // gated on `valid`, not just non-empty: the "Inserted from the schema example" header and the
    // placeholders hint disappear along with the real preview while the sentinel is shown
    expect(screen.queryByText('Inserted from the schema example')).toBeNull();
    expect(screen.queryByText('Names in references are placeholders; edit them in the inspector.')).toBeNull();
    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
  });
  it('an invalid (duplicate) name also shows the sentinel, not a stale preview', () => {
    setup({ deployments: { 'backend-api': {} } });
    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'dep' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.value).toBe('backend-api-2');
    expect(document.querySelector('.launcher pre')!.textContent).toContain('backend-api-2:');
    fireEvent.change(name, { target: { value: 'backend-api' } });   // already exists
    expect(document.querySelector('.launcher pre')!.textContent).toBe('Type a valid name to preview the insert.');
  });
});
