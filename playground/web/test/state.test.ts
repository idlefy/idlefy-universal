import { describe, it, expect, vi, afterEach } from 'vitest';
import { reducer, initialState, markersFrom, pointerToPath, EDIT_FAILED } from '../src/app/state';
// engine/types.ts has no side effects, so importing SUPERSEDED from it here doesn't pull the
// engine/WASM code into this test — it stays bundle-free.
import { SUPERSEDED } from '../src/engine/types';

afterEach(() => vi.restoreAllMocks());

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
  describe('focusPath', () => {
    const ok = { ok: true as const, manifests: [], durationMs: 1 };
    const node = (id: string, path: (string | number)[]) => ({ id, key: id, kind: 'Deployment', name: id, namespace: 'default', family: 'workload' as const, external: false, conflict: false, hookBadge: false, warnings: [], provenance: { path, governingCondition: '', removeAction: [] } });
    const armed = () => reducer(reducer(initialState('deployments: {}\n'), { type: 'tab', tab: 'yaml' }),
      { type: 'edit', ops: [{ op: 'set', path: ['deployments', 'web'], value: { replicas: 1 } }], focus: ['deployments', 'web'] });
    it('starts null and is armed by an edit that carries a focus path', () => {
      expect(initialState('').focusPath).toBe(null);
      expect(armed().focusPath).toEqual(['deployments', 'web']);
      expect(armed().editError).toBe(null);
    });
    it('a matching render-done selects the node, opens the Fields tab and clears the focus', () => {
      const s = reducer(armed(), { type: 'render-done', result: ok, graph: { nodes: [node('default/Service/web', ['deployments', 'web', 'service']), node('default/Deployment/web', ['deployments', 'web'])], edges: [], warnings: [] } });
      expect(s.selection).toBe('default/Deployment/web');
      expect(s.ui.tab).toBe('inspector');
      expect(s.focusPath).toBe(null);
    });
    it('a non-matching render-done also clears it (one-shot) and leaves the selection alone', () => {
      const s = reducer(armed(), { type: 'render-done', result: ok, graph: { nodes: [node('default/Deployment/other', ['deployments', 'other'])], edges: [], warnings: [] } });
      expect(s.selection).toBe(null);
      expect(s.focusPath).toBe(null);
    });
    it('a failed render-done clears it; a superseded one is ignored', () => {
      expect(reducer(armed(), { type: 'render-done', result: { ok: false, error: { kind: 'template', message: 'boom' } }, graph: null }).focusPath).toBe(null);
      expect(reducer(armed(), { type: 'render-done', result: { ok: false, error: { kind: 'template', message: SUPERSEDED } }, graph: null }).focusPath).toEqual(['deployments', 'web']);
    });
    it('release and ns still work (guard against a dropped switch case)', () => {
      expect(reducer(initialState(''), { type: 'release', v: 'x' }).releaseName).toBe('x');
      expect(reducer(initialState(''), { type: 'ns', v: 'kube' }).namespace).toBe('kube');
    });
    it('select, text, example, engine-failed and a focus-less edit all clear it', () => {
      expect(reducer(armed(), { type: 'select', id: 'x' }).focusPath).toBe(null);
      expect(reducer(armed(), { type: 'select', id: null }).focusPath).toBe(null);
      expect(reducer(armed(), { type: 'text', text: 'jobs: {}\n' }).focusPath).toBe(null);
      expect(reducer(armed(), { type: 'example', text: 'jobs: {}\n' }).focusPath).toBe(null);
      expect(reducer(armed(), { type: 'engine-failed', message: 'x' }).focusPath).toBe(null);
      expect(reducer(armed(), { type: 'edit', ops: [{ op: 'set', path: ['deployments', 'web', 'replicas'], value: 9 }] }).focusPath).toBe(null);
    });
    it('an add that changes nothing reports it instead of arming the focus', () => {
      // a sequence root: setIn is a documented no-op, so the insert cannot land
      const s = reducer(initialState('- a\n- b\n'), { type: 'edit', ops: [{ op: 'set', path: ['deployments', 'api'], value: { replicas: 1 } }], focus: ['deployments', 'api'] });
      expect(s.text).toBe('- a\n- b\n');
      expect(s.focusPath).toBe(null);
      expect(s.editError).toBe(EDIT_FAILED);
      expect(reducer(s, { type: 'text', text: 'a: 1\n' }).editError).toBe(null);
      expect(reducer(s, { type: 'select', id: null }).editError).toBe(null);
    });
    it('an op that cannot be stringified (no YAML tag) is a silent no-op like any other, reported only when focus is set', () => {
      // A Symbol has no YAML tag; `ValuesDocument.toString()` now catches that throw internally
      // (see values-document.test.ts) and falls back to the source, so this reaches the reducer as
      // an ordinary `text === s.text` no-op rather than the reducer's own try/catch — same policy as
      // every other no-op edit: silent without a focus path, reported with one.
      const s0 = initialState('a: 1\n');
      const s = reducer(s0, { type: 'edit', ops: [{ op: 'set', path: ['a'], value: Symbol('x') }] });
      expect(s.text).toBe('a: 1\n');
      expect(s.doc).toBe(s0.doc);
      expect(s.editError).toBe(null);
      expect(s.focusPath).toBe(null);
      const withFocus = reducer(s0, { type: 'edit', ops: [{ op: 'set', path: ['a'], value: Symbol('x') }], focus: ['a'] });
      expect(withFocus.editError).toBe(EDIT_FAILED);
      expect(withFocus.focusPath).toBe(null);
    });
    it('an edit that leaves toString unable to stringify (unresolved alias) falls back to the source and reports a no-op', () => {
      // deleteIn removes the anchored `web` node outright; the alias `*w` elsewhere is left dangling,
      // so ValuesDocument.toString() catches yaml's throw and returns the pre-edit source unchanged —
      // the reducer then sees `text === s.text` and, since a focus was requested, reports EDIT_FAILED.
      const src = 'deployments:\n  web: &w\n    replicas: 1\nother: *w\n';
      const s0 = initialState(src);
      const s = reducer(s0, { type: 'edit', ops: [{ op: 'delete', path: ['deployments', 'web'] }], focus: ['deployments', 'web'] });
      expect(s.text).toBe(src);
      expect(s.focusPath).toBe(null);
      expect(s.editError).toBe(EDIT_FAILED);
    });
    it('a focus-carrying edit while the document has parse errors reports it instead of vanishing silently', () => {
      const s0 = initialState('deployments: [\n');
      expect(s0.doc.errors.length).toBeGreaterThan(0);
      const s = reducer(s0, { type: 'edit', ops: [{ op: 'set', path: ['deployments', 'web'], value: { replicas: 1 } }], focus: ['deployments', 'web'] });
      expect(s.text).toBe(s0.text);
      expect(s.focusPath).toBe(null);
      expect(s.editError).toBe(EDIT_FAILED);
    });
    it('bumps editErrorSeq on every failure, even a repeated identical one, so the banner can re-key', () => {
      const s0 = initialState('- a\n- b\n');
      expect(s0.editErrorSeq).toBe(0);
      const fail = { type: 'edit' as const, ops: [{ op: 'set' as const, path: ['deployments', 'api'], value: { replicas: 1 } }], focus: ['deployments', 'api'] };
      const s1 = reducer(s0, fail);
      expect(s1.editError).toBe(EDIT_FAILED);
      expect(s1.editErrorSeq).toBe(1);
      const s2 = reducer(s1, fail);
      expect(s2.editError).toBe(EDIT_FAILED);
      expect(s2.editErrorSeq).toBe(2);
    });
    it('example and a successful edit both clear a previously set editError', () => {
      const s0 = initialState('- a\n- b\n');
      const failed = reducer(s0, { type: 'edit', ops: [{ op: 'set', path: ['deployments', 'api'], value: { replicas: 1 } }], focus: ['deployments', 'api'] });
      expect(failed.editError).toBe(EDIT_FAILED);
      expect(reducer(failed, { type: 'example', text: 'deployments: {}\n' }).editError).toBe(null);
      const okDoc = initialState('deployments: {}\n');
      const withError = { ...okDoc, editError: EDIT_FAILED, editErrorSeq: 1 };
      const succeeded = reducer(withError, { type: 'edit', ops: [{ op: 'set', path: ['deployments', 'web'], value: { replicas: 1 } }] });
      expect(succeeded.editError).toBe(null);
    });
  });
});
