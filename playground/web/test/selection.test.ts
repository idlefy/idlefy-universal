import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';
import { anchorOf, blockId, groupId, resolveSelection, titleOf } from '../src/app/selection';

const g = (() => { const { manifests, values } = loadFixture('stateful-storage'); return buildGraph(manifests, values, 'default'); })();
const web = g.nodes.find((n) => n.kind === 'Deployment' && n.name === 'web')!;

describe('selection strings', () => {
  it('builds ids', () => {
    expect(groupId(web.id)).toBe('group:default/Deployment/web');
    expect(blockId(['deployments', 'web', 'ingress'])).toBe('block:deployments.web.ingress');
  });
  it('resolves a node, a group and a nodeless block', () => {
    expect(resolveSelection(g, web.id)).toEqual({ kind: 'node', node: web });
    const grp = resolveSelection(g, groupId(web.id));
    expect(grp?.kind).toBe('group');
    if (grp?.kind === 'group') expect(grp.group.members.map((m) => m.kind).sort()).toEqual(['Job', 'Service']);
    expect(resolveSelection(g, blockId(['deployments', 'web', 'ingress']))).toEqual({ kind: 'block', path: ['deployments', 'web', 'ingress'], owner: web });
  });
  it('returns null for unknown ids, missing graph and a block whose owner is gone', () => {
    expect(resolveSelection(null, web.id)).toBeNull();
    expect(resolveSelection(g, null)).toBeNull();
    expect(resolveSelection(g, 'group:default/Deployment/nope')).toBeNull();
    expect(resolveSelection(g, 'block:deployments.nope.ingress')).toBeNull();
    expect(resolveSelection(g, 'block:deployments.web')).toBeNull();
  });
  it('anchors group and block selections to the owning workload', () => {
    expect(anchorOf(g, groupId(web.id))).toBe(web);
    expect(anchorOf(g, blockId(['deployments', 'web', 'hpa']))).toBe(web);
    expect(anchorOf(g, web.id)).toBe(web);
    expect(anchorOf(g, 'group:default/Deployment/nope')).toBeNull();
  });
  it('titles', () => {
    expect(titleOf({ kind: 'node', node: web })).toEqual({ name: 'web', kind: 'Deployment' });
    expect(titleOf(resolveSelection(g, groupId(web.id))!)).toEqual({ name: 'web', kind: 'Deployment group' });
    expect(titleOf({ kind: 'block', path: ['deployments', 'web', 'hpa'], owner: web })).toEqual({ name: 'web', kind: 'HorizontalPodAutoscaler' });
  });
});
