import { describe, it, expect } from 'vitest';
import schema from '../src/chart-bundle/schema.json';
import { starterBody, addEntityOps, previewYaml, PREVIEW_LINES } from '../src/palette/add';
import { starterValue } from '../src/inspector/form';
import { schemaAt } from '../src/inspector/schema';
import { ENTITIES, defaultName } from '../src/graph/entities';

const root = schema as any;

describe('palette add', () => {
  it('starterBody is the schema example for keys without a fixup, deep-cloned', () => {
    for (const key of ['statefulSets', 'daemonSets', 'jobs', 'cronJobs', 'configs', 'hpas', 'persistentVolumeClaims']) {
      const want = starterValue(root, schemaAt(root, [key, 'x'])!);
      const got = starterBody(root, key, 'x');
      expect(got, key).toEqual(want);
      expect(got, key).not.toBe(want);
    }
    expect((starterBody(root, 'configs', 'c') as any).type).toBe('configMap');
  });
  it('deployments: adds a container port so autoCreateService renders a Service', () => {
    const b = starterBody(root, 'deployments', 'web') as any;
    expect(b.autoCreateService).toBe(true);
    expect(b.containers.main.ports).toEqual({ http: { containerPort: 8080 } });
    expect(b.containers.main.image).toBe('nginx');
  });
  it('services: selector follows the name', () => {
    const b = starterBody(root, 'services', 'redis') as any;
    expect(b.selector).toEqual({ app: 'redis' });
    expect(b.ports).toEqual((starterValue(root, schemaAt(root, ['services', 'x'])!) as any).ports);   // starterValue returns unknown
  });
  it('ingresses: host instead of subdomain, no tls', () => {
    const b = starterBody(root, 'ingresses', 'gw') as any;
    expect(b.hosts).toEqual([{ host: 'gw.example.com', paths: [{ path: '/', pathType: 'Prefix' }] }]);
    expect(b.tls).toBeUndefined();
  });
  it('httpRoutes: hostnames use host, rules are kept', () => {
    const b = starterBody(root, 'httpRoutes', 'canary') as any;
    expect(b.hostnames).toEqual([{ host: 'canary.example.com' }]);
    expect(Array.isArray(b.rules)).toBe(true);
    expect(Array.isArray(b.parentRefs)).toBe(true);
  });
  it('addEntityOps is one set op at [key, name]', () => {
    const ops = addEntityOps(root, 'jobs', 'migrate');
    expect(ops).toEqual([{ op: 'set', path: ['jobs', 'migrate'], value: starterBody(root, 'jobs', 'migrate') }]);
  });
  it('previewYaml renders block YAML and trims to PREVIEW_LINES + an ellipsis line', () => {
    const short = previewYaml('jobs', 'j', { backoffLimit: 3 });
    expect(short).toBe('jobs:\n  j:\n    backoffLimit: 3');
    // deployments is 11 lines (not trimmed); statefulSets is 16 (trimmed). Measured during planning.
    expect(previewYaml('deployments', 'web', starterBody(root, 'deployments', 'web')).split('\n')).toHaveLength(11);
    const long = previewYaml('statefulSets', 'db', starterBody(root, 'statefulSets', 'db'));
    const lines = long.split('\n');
    expect(lines).toHaveLength(PREVIEW_LINES + 1);
    expect(lines[PREVIEW_LINES]).toBe('…');
    expect(lines[0]).toBe('statefulSets:');
  });
  it('every entity has a starter body under its default name', () => {
    for (const e of ENTITIES) expect(starterBody(root, e.key, defaultName(root, e.key)), e.key).toBeTruthy();
  });
});
