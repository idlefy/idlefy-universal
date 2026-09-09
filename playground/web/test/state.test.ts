import { describe, it, expect } from 'vitest';
import { reducer, initialState, markersFrom, pointerToPath } from '../src/app/state';
// engine/types.ts has no side effects, so importing SUPERSEDED from it here doesn't pull the
// engine/WASM code into this test — it stays bundle-free.
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
  it('keeps group and block selections while their workload exists, drops them when it goes', () => {
    let s = initialState('deployments: {}\n');
    const wl = (id: string, name: string) => ({ id, key: id, kind: 'Deployment', name, namespace: 'default', family: 'workload' as const, external: false, conflict: false, hookBadge: false, warnings: [], manifest: { raw: '', kind: 'Deployment', name, namespace: 'default', templatePath: 't' } as any, provenance: { path: ['deployments', name], governingCondition: '', removeAction: [] } });
    const graphA = { nodes: [wl('default/Deployment/a', 'a')], edges: [], warnings: [] };
    s = reducer(s, { type: 'render-done', result: { ok: true, manifests: [], durationMs: 1 }, graph: graphA });
    s = reducer(s, { type: 'select', id: 'group:default/Deployment/a' });
    s = reducer(s, { type: 'render-done', result: { ok: true, manifests: [], durationMs: 1 }, graph: graphA });
    expect(s.selection).toBe('group:default/Deployment/a');
    s = reducer(s, { type: 'select', id: 'block:deployments.a.hpa' });
    s = reducer(s, { type: 'render-done', result: { ok: true, manifests: [], durationMs: 1 }, graph: graphA });
    expect(s.selection).toBe('block:deployments.a.hpa');
    const graphB = { nodes: [wl('default/Deployment/b', 'b')], edges: [], warnings: [] };
    s = reducer(s, { type: 'render-done', result: { ok: true, manifests: [], durationMs: 1 }, graph: graphB });
    expect(s.selection).toBe(null);
  });
  it('keeps the last graph when a graph build fails (dispatched as a template error)', () => {
    let s = initialState('deployments: {}\n');
    const graph = { nodes: [], edges: [], warnings: [] };
    s = reducer(s, { type: 'render-done', result: { ok: true, manifests: [], durationMs: 1 }, graph });
    s = reducer(s, { type: 'render-done', result: { ok: false, error: { kind: 'template', message: 'graph: boom' } }, graph: null });
    expect(s.graph).toBe(graph);
    expect(markersFrom(s)[0].message).toBe('graph: boom');
  });
  it('engine-failed records the message', () => {
    const s = reducer(initialState('deployments: {}\n'), { type: 'engine-failed', message: 'Failed to fetch' });
    expect(s.engineError).toBe('Failed to fetch');
  });
  it('unescapes JSON pointer segments and numbers array indices', () => {
    expect(pointerToPath('/a~1b/c~0d/0')).toEqual(['a/b', 'c~d', 0]);
  });
  it('edit applies ops to the document and re-derives text (selection preserved)', () => {
    let s = initialState('deployments:\n  web:\n    replicas: 1\n');
    s = reducer(s, { type: 'select', id: 'default/Deployment/web' });
    s = reducer(s, { type: 'edit', ops: [{ op: 'set', path: ['deployments', 'web', 'replicas'], value: 3 }] });
    expect(s.text).toBe('deployments:\n  web:\n    replicas: 3\n');
    expect(s.doc.valueAt(['deployments', 'web', 'replicas'])).toBe(3);
    expect(s.selection).toBe('default/Deployment/web');
  });
  it('edit is a no-op while the document has syntax errors', () => {
    const s0 = initialState('deployments: [\n');
    const s1 = reducer(s0, { type: 'edit', ops: [{ op: 'set', path: ['x'], value: 1 }] });
    expect(s1).toBe(s0);
  });
  it('edit is a no-op when nothing changes', () => {
    const s0 = initialState('a: 1\n');
    expect(reducer(s0, { type: 'edit', ops: [{ op: 'set', path: ['a'], value: 1 }] })).toBe(s0);
  });
  it('tier and tab actions update ui state', () => {
    let s = initialState('a: 1\n');
    expect(s.ui).toEqual({ tier: 'basic', tab: 'inspector' });
    s = reducer(s, { type: 'tier', tier: 'advanced' });
    s = reducer(s, { type: 'tab', tab: 'yaml' });
    expect(s.ui).toEqual({ tier: 'advanced', tab: 'yaml' });
  });
});
