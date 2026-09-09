import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';
import { groupsOf } from '../src/graph/groups';

describe('groupsOf', () => {
  it('groups a workload with the resources it owns', () => {
    const { manifests, values } = loadFixture('stateful-storage');
    const g = buildGraph(manifests, values, 'default');
    const groups = groupsOf(g);
    const web = groups.find((x) => x.owner.kind === 'Deployment' && x.owner.name === 'web')!;
    expect(web.id).toBe('group:default/Deployment/web');
    expect(web.members.map((m) => `${m.kind}/${m.name}`).sort()).toEqual(['Job/web-migrations', 'Service/web']);
    const cache = groups.find((x) => x.owner.kind === 'StatefulSet')!;
    expect(cache.members.map((m) => `${m.kind}/${m.name}`)).toEqual(['Service/cache-headless']);
    // standalone entities never join a group
    expect(groups.flatMap((x) => x.members).some((m) => m.kind === 'PersistentVolumeClaim' || m.kind === 'ConfigMap')).toBe(false);
  });
  it('a workload without owned resources still gets a group of its own', () => {
    // stateful-storage's deployments.files mounts a PVC and creates nothing (no Service, no migrations)
    const { manifests, values } = loadFixture('stateful-storage');
    const files = groupsOf(buildGraph(manifests, values, 'default')).find((x) => x.owner.name === 'files')!;
    expect(files.members).toEqual([]);
    expect(files.id).toBe('group:default/Deployment/files');
  });
  it('never frames a standalone entity', () => {
    const { manifests, values } = loadFixture('full-features');
    const g = buildGraph(manifests, values, 'default');
    const owners = groupsOf(g).map((x) => x.owner.kind);
    expect(owners.every((k) => ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(k))).toBe(true);
    expect(owners.length).toBe(g.nodes.filter((n) => n.provenance && !n.provenance.owner && n.provenance.path.length === 2 && ['deployments', 'statefulSets', 'daemonSets', 'jobs', 'cronJobs'].includes(String(n.provenance.path[0]))).length);
  });
});
