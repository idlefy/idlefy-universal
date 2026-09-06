import { describe, it, expect } from 'vitest';
import { toRenderResult } from '../src/engine/client';

const good = 'apiVersion: v1\nkind: Service\nmetadata:\n  name: a\n';

describe('toRenderResult', () => {
  it('splits every template, sorted by path', () => {
    const r = toRenderResult({ ok: true, manifests: { 'templates/b.yaml': good, 'templates/a.yaml': good } }, 12);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manifests.map((m) => m.templatePath)).toEqual(['templates/a.yaml', 'templates/b.yaml']);
      expect(r.durationMs).toBe(12);
    }
  });
  it('turns malformed rendered YAML into a yaml error carrying the template path', () => {
    const r = toRenderResult({ ok: true, manifests: { 'templates/bad.yaml': 'kind: Service\nmetadata:\n\tname: a\n' } }, 3);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe('yaml');
      expect(r.error.path).toBe('templates/bad.yaml');
      expect(r.error.message).toContain('Tabs are not allowed as indentation');
    }
  });
  it('normalizes an empty engine error path to undefined', () => {
    const r = toRenderResult({ ok: false, error: { kind: 'schema', message: 'nope', path: '' } }, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.path).toBeUndefined();
  });
});
