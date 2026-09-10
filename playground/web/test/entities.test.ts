import { describe, it, expect } from 'vitest';
import schema from '../src/chart-bundle/schema.json';
import { ENTITIES, entityOf, namePattern, defaultName, uniqueName, DNS_LABEL } from '../src/graph/entities';
import { WORKLOAD_KEYS, WORKLOAD_KINDS } from '../src/graph/secondary';
import { isObj } from '../src/model/guards';

const root = schema as any;

describe('entities', () => {
  it('lists the five workload keys first, with the kinds from WORKLOAD_KINDS', () => {
    const workloads = ENTITIES.filter((e) => e.group === 'workloads');
    expect(new Set(workloads.map((e) => e.key))).toEqual(WORKLOAD_KEYS);
    for (const e of workloads) expect(e.kind).toBe(WORKLOAD_KINDS[e.key]);
    expect(ENTITIES.slice(0, 5).every((e) => e.group === 'workloads')).toBe(true);
  });
  it('is exactly the set of top-level properties whose additionalProperties is a $ref', () => {
    const refKeys = Object.entries<any>(root.properties)
      .filter(([, v]) => isObj<any>(v.additionalProperties) && typeof v.additionalProperties.$ref === 'string')
      .map(([k]) => k).sort();
    expect(ENTITIES.map((e) => e.key).slice().sort()).toEqual(refKeys);
    expect(refKeys).toHaveLength(11);
  });
  it('has the menu order and copy from the spec', () => {
    expect(ENTITIES.map((e) => [e.key, e.label, e.kind])).toEqual([
      ['deployments', 'Deployment', 'Deployment'], ['statefulSets', 'StatefulSet', 'StatefulSet'], ['daemonSets', 'DaemonSet', 'DaemonSet'],
      ['jobs', 'Job', 'Job'], ['cronJobs', 'CronJob', 'CronJob'], ['configs', 'Config', 'ConfigMap'], ['services', 'Service', 'Service'],
      ['ingresses', 'Ingress', 'Ingress'], ['httpRoutes', 'HTTPRoute', 'HTTPRoute'], ['hpas', 'HPA', 'HorizontalPodAutoscaler'],
      ['persistentVolumeClaims', 'PVC', 'PersistentVolumeClaim'],
    ]);
    for (const e of ENTITIES) expect(e.description.length).toBeLessThanOrEqual(40);
    expect(entityOf('hpas')?.label).toBe('HPA');
    expect(entityOf('nope')).toBeUndefined();
  });
  it('defaultName is the first key of examples[0] for every entity', () => {
    const want: Record<string, string> = {
      deployments: 'backend-api', statefulSets: 'postgres', daemonSets: 'fluent-bit', jobs: 'db-migration', cronJobs: 'nightly-backup',
      configs: 'app-config', services: 'external-redis', ingresses: 'api-gateway', httpRoutes: 'canary-route', hpas: 'external-api',
      persistentVolumeClaims: 'data-storage',
    };
    for (const e of ENTITIES) expect(defaultName(root, e.key), e.key).toBe(want[e.key]);
  });
  it('namePattern uses propertyNames.pattern when present, else the DNS label', () => {
    expect(root.properties.deployments.propertyNames.pattern).toBe(DNS_LABEL.source);
    expect(namePattern(root, 'deployments')).toBe(DNS_LABEL);              // schema pattern == DNS label → the shared object
    expect(root.properties.configs.propertyNames).toBeUndefined();
    expect(namePattern(root, 'configs')).toBe(DNS_LABEL);
    expect(DNS_LABEL.test('app-config')).toBe(true);
    expect(DNS_LABEL.test('App')).toBe(false);
    expect(DNS_LABEL.test('-a')).toBe(false);
  });
  it('uniqueName appends the first free suffix ≥ 2', () => {
    expect(uniqueName('web', [])).toBe('web');
    expect(uniqueName('web', ['web'])).toBe('web-2');
    expect(uniqueName('web', ['web', 'web-2'])).toBe('web-3');
    expect(uniqueName('web', ['web-2'])).toBe('web');
  });
  it('a bespoke propertyNames pattern is anchored (a substring match must not pass)', () => {
    const root = { properties: { widgets: { type: 'object', propertyNames: { pattern: 'ab' }, additionalProperties: {} } } } as any;
    const p = namePattern(root, 'widgets');
    expect(p).not.toBe(DNS_LABEL);
    expect(p.test('ab')).toBe(true);
    expect(p.test('zabz')).toBe(false);
  });
});
