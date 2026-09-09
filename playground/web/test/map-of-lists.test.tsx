// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import schema from '../src/chart-bundle/schema.json';
import { FieldRow } from '../src/inspector/fields';
import { classify, resolve } from '../src/inspector/schema';

const root = schema as any;
afterEach(cleanup);
const node = resolve(root, root.properties.secretRefs);
const field = (value: unknown) => ({ key: 'secretRefs', path: ['secretRefs'], label: 'secretRefs', widget: classify(root, node), schema: node, value, present: value !== undefined, required: false, tier: 'basic' as const });
const value = { db: [{ name: 'DB_URL', secretKeyRef: { name: 'db', key: 'url' } }], api: [] };

describe('MapOfListsField', () => {
  it('one card per key with a count, rows inside, remove the key', () => {
    const onEdit = vi.fn();
    render(<FieldRow root={root} field={field(value)} tier="basic" onEdit={onEdit} bare />);
    expect(document.querySelectorAll('.card').length).toBe(2);
    expect(document.querySelector('.card')!.textContent).toContain('1 variable');
    expect(document.querySelectorAll('.card')[1].textContent).toContain('0 variables');
    fireEvent.change(screen.getByLabelText('secretRefs.db.0.secretKeyRef.key'), { target: { value: 'dsn' } });
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['secretRefs', 'db', 0, 'secretKeyRef', 'key'], value: 'dsn' }]);
    expect(screen.getByLabelText('add secretRefs.db').textContent).toBe('Variable');
    fireEvent.click(screen.getByLabelText('remove secretRefs.db'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: ['secretRefs', 'db'] }]);
    expect(screen.queryByLabelText('secretRefs')).toBeNull();   // no textarea
  });
  it('+ Group reveals the key input and adds an empty list under a valid new key', () => {
    const onEdit = vi.fn();
    render(<FieldRow root={root} field={field(value)} tier="basic" onEdit={onEdit} bare />);
    expect(screen.queryByLabelText('new key secretRefs')).toBeNull();
    fireEvent.click(screen.getByLabelText('add group secretRefs'));
    const box = screen.getByLabelText('new key secretRefs');
    fireEvent.change(box, { target: { value: 'db' } });
    expect((screen.getByLabelText('add secretRefs') as HTMLButtonElement).disabled).toBe(true);   // duplicate
    fireEvent.change(box, { target: { value: 'cache' } });
    fireEvent.click(screen.getByLabelText('add secretRefs'));
    expect(onEdit).toHaveBeenLastCalledWith([{ op: 'set', path: ['secretRefs', 'cache'], value: [] }]);
  });
});
