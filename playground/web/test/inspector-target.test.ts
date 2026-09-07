import { describe, it, expect } from 'vitest';
import schema from '../src/chart-bundle/schema.json';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';
import { inspectTarget } from '../src/inspector/target';

const root = schema as any;
const g = (() => { const { manifests, values } = loadFixture('full-features'); return buildGraph(manifests, values, 'default'); })();
const node = (kind: string, name: string) => g.nodes.find((n) => n.kind === kind && n.name === name)!;

describe('inspectTarget', () => {
  it('workloads open on their own entry', () => {
    expect(inspectTarget(node('Deployment', 'api'), root)).toEqual({ kind: 'workload', kindKey: 'deployments', name: 'api', path: ['deployments', 'api'] });
    expect(inspectTarget(node('StatefulSet', 'cache'), root)).toMatchObject({ kind: 'workload', kindKey: 'statefulSets' });
  });
  it('secondary blocks with a schema node open as entities; blocks without one fall back to the owner', () => {
    expect(inspectTarget(node('Ingress', 'api'), root)).toEqual({ kind: 'entity', path: ['deployments', 'api', 'ingress'] });
    expect(inspectTarget(node('PodDisruptionBudget', 'api'), root)).toEqual({ kind: 'entity', path: ['deployments', 'api', 'pdb'] });
    expect(inspectTarget(node('Service', 'api'), root)).toEqual({ kind: 'owner-only', owner: ['deployments', 'api'], secondary: 'service' });
    expect(inspectTarget(node('Role', 'api'), root)).toEqual({ kind: 'entity', path: ['deployments', 'api', 'rbac'] });
    // full-features has no migrations Job; MigrationsConfig has a schema node, so it opens as an entity too
    const ss = (() => { const { manifests, values } = loadFixture('stateful-storage'); return buildGraph(manifests, values, 'default'); })();
    const job = ss.nodes.find((n) => n.kind === 'Job' && n.name === 'web-migrations')!;
    expect(inspectTarget(job, root)).toEqual({ kind: 'entity', path: ['deployments', 'web', 'migrations'] });
  });
  it('standalone entities, release and externals', () => {
    expect(inspectTarget(node('Service', 'cache-headless'), root)).toEqual({ kind: 'owner-only', owner: ['statefulSets', 'cache'], secondary: 'service' });
    expect(inspectTarget(node('ConfigMap', 'app-config'), root)).toEqual({ kind: 'entity', path: ['configs', 'app-config'] });
    expect(inspectTarget(node('Release', 'settings'), root)).toEqual({ kind: 'release' });
    expect(inspectTarget(node('ClusterIssuer', 'letsencrypt-staging'), root).kind).toBe('none');
  });
});
