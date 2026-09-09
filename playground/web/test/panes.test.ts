import { describe, it, expect } from 'vitest';
import { DEFAULT_PANES, PANE_LIMITS, STORAGE_KEY, clampWidth, parsePanes, loadPanes, savePanes } from '../src/app/panes';

describe('panes', () => {
  it('defaults: editor collapsed, inspector open, default widths', () => {
    expect(DEFAULT_PANES).toEqual({ editor: { open: false, width: 400 }, inspector: { open: true, width: 400 } });
    expect(PANE_LIMITS.editor).toEqual({ min: 300, max: 720, default: 400 });
    expect(PANE_LIMITS.inspector).toEqual({ min: 320, max: 640, default: 400 });
  });
  it('clamps widths to the pane limits', () => {
    expect(clampWidth('editor', 10)).toBe(300);
    expect(clampWidth('editor', 5000)).toBe(720);
    expect(clampWidth('inspector', 500)).toBe(500);
    expect(clampWidth('inspector', NaN)).toBe(400);
  });
  it('parses stored state tolerantly', () => {
    expect(parsePanes(null)).toEqual(DEFAULT_PANES);
    expect(parsePanes('not json')).toEqual(DEFAULT_PANES);
    expect(parsePanes('{"editor":{"open":true,"width":9999}}')).toEqual({ editor: { open: true, width: 720 }, inspector: { open: true, width: 400 } });
    expect(parsePanes('{"inspector":{"open":"yes","width":"330"}}').inspector).toEqual({ open: true, width: 330 });
    // width: null must fall back to the pane default, not Number(null) === 0 clamped to min.
    expect(parsePanes('{"editor":{"width":null}}').editor).toEqual({ open: false, width: 400 });
  });
  it('load/save go through the given storage and swallow throws', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    savePanes(storage, { editor: { open: true, width: 333 }, inspector: { open: false, width: 400 } });
    expect(store.get(STORAGE_KEY)).toContain('333');
    expect(loadPanes(storage).editor).toEqual({ open: true, width: 333 });
    expect(loadPanes(null)).toEqual(DEFAULT_PANES);
    const boom = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadPanes(boom)).toEqual(DEFAULT_PANES);
    expect(() => savePanes(boom, DEFAULT_PANES)).not.toThrow();
  });
});
