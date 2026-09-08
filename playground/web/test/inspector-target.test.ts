import { describe, it, expect } from 'vitest';
import schema from '../src/chart-bundle/schema.json';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';
import { inspectTarget } from '../src/inspector/target';
import { resolveSelection, groupId, blockId } from '../src/app/selection';

const root = schema as any;
const g = (() => { const { manifests, values } = loadFixture('full-features'); return buildGraph(manifests, values, 'default'); })();
const node = (kind: string, name: string) => g.nodes.find((n) => n.kind === kind && n.name === name)!;
const sel = (kind: string, name: string) => ({ kind: 'node' as const, node: node(kind, name) });

describe('inspectTarget', () => {
  it('workloads open on their own entry', () => {
    expect(inspectTarget(sel('Deployment', 'api'), root)).toEqual({ kind: 'workload', kindKey: 'deployments', name: 'api', path: ['deployments', 'api'] });
    expect(inspectTarget(sel('StatefulSet', 'cache'), root)).toMatchObject({ kind: 'workload', kindKey: 'statefulSets' });
  });
  it('auto-created resources open as secondary panels, with or without a schema node', () => {
    expect(inspectTarget(sel('Ingress', 'api'), root)).toEqual({ kind: 'secondary', owner: ['deployments', 'api'], secondary: 'ingress', path: ['deployments', 'api', 'ingress'], node: node('Ingress', 'api') });
    expect(inspectTarget(sel('PodDisruptionBudget', 'api'), root)).toMatchObject({ kind: 'secondary', secondary: 'pdb' });
    expect(inspectTarget(sel('Service', 'api'), root)).toMatchObject({ kind: 'secondary', owner: ['deployments', 'api'], secondary: 'service', path: ['deployments', 'api', 'service'] });
    expect(inspectTarget(sel('Role', 'api'), root)).toMatchObject({ kind: 'secondary', secondary: 'rbac' });
    expect(inspectTarget(sel('Service', 'cache-headless'), root)).toMatchObject({ kind: 'secondary', owner: ['statefulSets', 'cache'], secondary: 'service' });
    const ss = (() => { const { manifests, values } = loadFixture('stateful-storage'); return buildGraph(manifests, values, 'default'); })();
    const job = ss.nodes.find((n) => n.kind === 'Job' && n.name === 'web-migrations')!;
    expect(inspectTarget({ kind: 'node', node: job }, root)).toMatchObject({ kind: 'secondary', secondary: 'migrations', path: ['deployments', 'web', 'migrations'] });
  });
  it('groups and nodeless blocks', () => {
    const grp = resolveSelection(g, groupId(node('Deployment', 'api').id))!;
    expect(inspectTarget(grp, root)).toMatchObject({ kind: 'group', owner: node('Deployment', 'api') });
    const blk = resolveSelection(g, blockId(['deployments', 'api', 'hpa']))!;
    expect(inspectTarget(blk, root)).toEqual({ kind: 'secondary', owner: ['deployments', 'api'], secondary: 'hpa', path: ['deployments', 'api', 'hpa'], node: null });
    expect(inspectTarget({ kind: 'block', path: ['deployments', 'api', 'nonsense'], owner: node('Deployment', 'api') }, root).kind).toBe('none');
  });
  it('standalone entities, release and externals', () => {
    expect(inspectTarget(sel('ConfigMap', 'app-config'), root)).toEqual({ kind: 'entity', path: ['configs', 'app-config'] });
    expect(inspectTarget(sel('Release', 'settings'), root)).toEqual({ kind: 'release' });
    expect(inspectTarget(sel('ClusterIssuer', 'letsencrypt-staging'), root).kind).toBe('none');
  });
});
