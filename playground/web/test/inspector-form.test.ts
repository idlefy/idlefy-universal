import { describe, it, expect } from 'vitest';
import schema from '../src/chart-bundle/schema.json';
import { buildFields, starterValue } from '../src/inspector/form';
import { schemaAt } from '../src/inspector/schema';

const root = schema as any;
const dep = schemaAt(root, ['deployments', 'web'])!;

describe('buildFields', () => {
  it('basic tier lists basic, required and present fields only', () => {
    const value = { replicas: 2, containers: { main: { image: 'nginx', imageTag: '1' } }, priorityClassName: 'high' };
    const keys = buildFields(root, dep, ['deployments', 'web'], value, 'basic').map((f) => f.key);
    expect(keys).toContain('replicas');
    expect(keys).toContain('containers');          // required + basic
    expect(keys).toContain('priorityClassName');   // advanced but present
    expect(keys).not.toContain('tolerations');     // advanced, absent
    // fields keep schema property order (no reordering): DeploymentSpec lists `containers` before `replicas`
    // (values.schema.json properties are alphabetically ordered; verified against the source schema)
    expect(keys.indexOf('replicas')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('containers')).toBeLessThan(keys.indexOf('replicas'));
  });
  it('advanced tier lists every property and marks tiers', () => {
    const fields = buildFields(root, dep, ['deployments', 'web'], {}, 'advanced');
    expect(fields.length).toBe(Object.keys(dep.properties ?? (root.$defs.DeploymentSpec.properties)).length);
    expect(fields.find((f) => f.key === 'replicas')?.tier).toBe('basic');
    expect(fields.find((f) => f.key === 'tolerations')?.tier).toBe('advanced');
  });
  it('carries path, value, presence and required', () => {
    const f = buildFields(root, dep, ['deployments', 'web'], { replicas: 4 }, 'advanced');
    const rep = f.find((x) => x.key === 'replicas')!;
    expect(rep).toMatchObject({ path: ['deployments', 'web', 'replicas'], value: 4, present: true, required: false, widget: { kind: 'number' } });
    expect(f.find((x) => x.key === 'containers')).toMatchObject({ present: false, required: true, value: undefined });
  });
  it('hide() removes keys (used for toggle-managed autoCreate* flags)', () => {
    const keys = buildFields(root, dep, ['deployments', 'web'], {}, 'advanced', { hide: (k) => k.startsWith('autoCreate') }).map((f) => f.key);
    expect(keys.some((k) => k.startsWith('autoCreate'))).toBe(false);
  });
  it('starterValue prefers the first example and falls back to required-only objects', () => {
    expect(starterValue(root, root.$defs.PortSpec)).toEqual({ containerPort: 8080, protocol: 'TCP', servicePort: 80 });
    expect(starterValue(root, { type: 'object', required: ['name'], properties: { name: { type: 'string' }, x: { type: 'integer' } } })).toEqual({ name: '' });
    expect(starterValue(root, { type: 'integer' })).toBe(0);
    expect(starterValue(root, { type: 'boolean' })).toBe(false);
  });
});
