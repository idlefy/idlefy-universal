import { describe, it, expect } from 'vitest';
import { reducer, initialState, markersFrom } from '../src/app/state';

describe('app state', () => {
  it('keeps the last good graph when a render fails', () => {
    let s = initialState('deployments: {}\n');
    const graph = { nodes: [], edges: [], warnings: [] };
    s = reducer(s, { type: 'render-done', result: { ok: true, manifests: [], durationMs: 1 }, graph });
    s = reducer(s, { type: 'render-done', result: { ok: false, error: { kind: 'schema', message: 'x', path: '/deployments/app' } }, graph: null });
    expect(s.graph).toBe(graph);
    expect(s.render?.ok).toBe(false);
  });
  it('produces a marker at the schema error path line', () => {
    let s = initialState('deployments:\n  app:\n    replcias: 1\n');
    s = reducer(s, { type: 'render-done', result: { ok: false, error: { kind: 'schema', message: "- at '/deployments/app': additional properties 'replcias' not allowed", path: '/deployments/app' } }, graph: null });
    expect(markersFrom(s)).toEqual([{ line: 2, col: undefined, message: expect.stringContaining('replcias'), severity: 'error' }]);
  });
  it('produces a marker from YAML syntax errors', () => {
    const s = initialState('deployments:\n  app: [\n');
    const m = markersFrom(s);
    expect(m.length).toBeGreaterThan(0);   // eemeli/yaml may report several errors for one unterminated flow collection
    expect(m[0].severity).toBe('error');
  });
  it('ignores superseded render results', () => {
    let s = initialState('deployments: {}\n');
    s = reducer(s, { type: 'render-start' });
    const before = s;
    s = reducer(s, { type: 'render-done', result: { ok: false, error: { kind: 'template', message: 'superseded' } }, graph: null });
    expect(s).toBe(before);
  });
});
