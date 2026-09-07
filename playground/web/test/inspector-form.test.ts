import { describe, it, expect } from 'vitest';
import schema from '../src/chart-bundle/schema.json';
import { buildFields, starterValue, firstSentence, chipValue } from '../src/inspector/form';
import { classify, schemaAt } from '../src/inspector/schema';

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
  it('starterValue prefers `default` over `examples`', () => {
    // DeploymentSpec.autoCreateRbac has both `default: false` and `examples: [true]` — default wins.
    expect(starterValue(root, root.$defs.DeploymentSpec.properties.autoCreateRbac)).toBe(false);
  });
  it('starterValue seeds an empty string for bare oneOf/anyOf IntOrString nodes', () => {
    const minAvailable = schemaAt(root, ['deployments', 'web', 'pdb', 'minAvailable'])!;
    expect(starterValue(root, minAvailable)).toBe('');
  });
  it('starterValue deep-clones example/default-derived values (no live reference into the schema module)', () => {
    const sv = starterValue(root, root.$defs.PortSpec);
    const original = (schema as any).$defs.PortSpec.examples[0].http;
    expect(sv).toEqual(original);
    expect(sv).not.toBe(original);
    (sv as Record<string, unknown>).containerPort = 9999;
    expect(original.containerPort).toBe(8080);
  });
  describe('starterValue JS type matches widget kind (table test over real $defs)', () => {
    const defs = ['DeploymentSpec', 'PortSpec', 'PdbConfig', 'ServicePort', 'ContainerSpec'];
    for (const defName of defs) {
      const props = root.$defs[defName]?.properties ?? {};
      for (const [key, propSchema] of Object.entries<any>(props)) {
        it(`${defName}.${key}`, () => {
          const widget = classify(root, propSchema);
          const sv = starterValue(root, propSchema);
          switch (widget.kind) {
            case 'boolean': expect(typeof sv).toBe('boolean'); break;
            case 'number': expect(typeof sv).toBe('number'); break;
            case 'string': expect(typeof sv).toBe('string'); break;
            case 'list': expect(Array.isArray(sv)).toBe(true); break;
            default: expect(typeof sv === 'object' && sv !== null).toBe(true); break;
          }
        });
      }
    }
  });
});

describe('firstSentence / chipValue', () => {
  it('cuts at the first sentence end, not the first line', () => {
    expect(firstSentence('Additional DNS names beyond the ingress.tls hosts (subject\nalternative names). Second sentence.')).toBe('Additional DNS names beyond the ingress.tls hosts (subject\nalternative names).');
    expect(firstSentence('No period here\nsecond line')).toBe('No period here');
    expect(firstSentence(undefined)).toBeUndefined();
    expect(firstSentence('  ')).toBeUndefined();
  });
  it('chip for a boolean turns it on; others use the starter value', () => {
    const dep = schemaAt(root, ['deployments', 'web'])!;
    const fields = buildFields(root, dep, ['deployments', 'web'], {}, 'advanced');
    const f = (k: string) => fields.find((x) => x.key === k)!;
    expect(chipValue(root, f('autoCreateSoftAntiAffinity'))).toBe(true);
    expect(typeof chipValue(root, f('replicas'))).toBe('number');   // default or examples[0] or 0
    expect(chipValue(root, f('labels'))).toEqual(expect.any(Object));
  });
});
