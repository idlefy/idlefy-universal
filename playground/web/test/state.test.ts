import { describe, it, expect } from 'vitest';
import { reducer, initialState, markersFrom, pointerToPath } from '../src/app/state';
import { SUPERSEDED } from '../src/engine/types';

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
    s = reducer(s, { type: 'render-done', result: { ok: false, error: { kind: 'template', message: SUPERSEDED } }, graph: null });
    expect(s).toBe(before);
  });
  it('drops a selection the rebuilt graph no longer contains', () => {
    let s = initialState('deployments: {}\n');
    const node = (id: string) => ({ id, key: id, kind: 'Deployment', name: id, namespace: 'default', family: 'workload' as const, external: false, conflict: false, hookBadge: false, warnings: [] });
    s = reducer(s, { type: 'render-done', result: { ok: true, manifests: [], durationMs: 1 }, graph: { nodes: [node('a')], edges: [], warnings: [] } });
    s = reducer(s, { type: 'select', id: 'a' });
    // the resource was renamed: the next graph has no node 'a'
    s = reducer(s, { type: 'render-done', result: { ok: true, manifests: [], durationMs: 1 }, graph: { nodes: [node('b')], edges: [], warnings: [] } });
    expect(s.selection).toBe(null);
    // a still-present selection survives
    s = reducer(s, { type: 'select', id: 'b' });
    s = reducer(s, { type: 'render-done', result: { ok: true, manifests: [], durationMs: 1 }, graph: { nodes: [node('b')], edges: [], warnings: [] } });
    expect(s.selection).toBe('b');
  });
  it('keeps the last graph when a graph build fails (dispatched as a template error)', () => {
    let s = initialState('deployments: {}\n');
    const graph = { nodes: [], edges: [], warnings: [] };
    s = reducer(s, { type: 'render-done', result: { ok: true, manifests: [], durationMs: 1 }, graph });
    s = reducer(s, { type: 'render-done', result: { ok: false, error: { kind: 'template', message: 'graph: boom' } }, graph: null });
    expect(s.graph).toBe(graph);
    expect(markersFrom(s)[0].message).toBe('graph: boom');
    expect(s.rendering).toBe(false);
  });
  it('engine-failed records the message and stops rendering', () => {
    let s = reducer(initialState('deployments: {}\n'), { type: 'render-start' });
    s = reducer(s, { type: 'engine-failed', message: 'Failed to fetch' });
    expect(s.engineError).toBe('Failed to fetch');
    expect(s.rendering).toBe(false);
  });
  it('unescapes JSON pointer segments and numbers array indices', () => {
    expect(pointerToPath('/a~1b/c~0d/0')).toEqual(['a/b', 'c~d', 0]);
  });
});
