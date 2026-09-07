import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';
import { groupsOf } from '../src/canvas/groups';

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
  it('a workload without owned resources gets no group', () => {
    const { manifests, values } = loadFixture('minimal');
    const g = buildGraph(manifests, values, 'default');
    expect(groupsOf(g).filter((x) => x.members.length === 0)).toEqual([]);
  });
});
