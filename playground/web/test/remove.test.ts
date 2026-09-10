import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';
import { resolveSelection, groupId, blockId } from '../src/app/selection';
import { removalOf } from '../src/canvas/remove';

const hello = loadFixture('example-01-hello-world');
const g = buildGraph(hello.manifests, hello.values, 'default');
const dep = g.nodes.find((n) => n.kind === 'Deployment')!;
const svc = g.nodes.find((n) => n.kind === 'Service')!;
const release = g.nodes.find((n) => n.kind === 'Release')!;
const full = loadFixture('full-features');
const fg = buildGraph(full.manifests, full.values, 'default');
const hpa = fg.nodes.find((n) => n.kind === 'HorizontalPodAutoscaler' && !n.provenance?.owner)!;
const gwFx = loadFixture('example-05-gateway-api');
const gw = buildGraph(gwFx.manifests, gwFx.values, 'default');
const external = gw.nodes.find((n) => n.external)!;

describe('removalOf', () => {
  it('a workload node: its own removeAction, short label, hinted title', () => {
    const r = removalOf(resolveSelection(g, dep.id)!)!;
    expect(r.ops).toEqual([{ op: 'delete', path: ['deployments', 'hello'] }]);
    expect(r.label).toBe('Remove Deployment hello');
    expect(r.title).toBe('Remove Deployment hello · Ctrl+Z restores');
  });
  it('a group: the owner\'s removeAction and the rendered-member count', () => {
    const r = removalOf(resolveSelection(g, groupId(dep.id))!)!;
    expect(r.ops).toEqual([{ op: 'delete', path: ['deployments', 'hello'] }]);
    expect(r.label).toBe('Remove Deployment hello');
    expect(r.title).toBe('Remove Deployment hello and its 1 rendered resource · Ctrl+Z restores');
  });
  it('a standalone resource (hpas.*) is removable', () => {
    expect(hpa).toBeTruthy();
    const r = removalOf(resolveSelection(fg, hpa.id)!)!;
    expect(r.ops).toEqual([{ op: 'delete', path: ['hpas', hpa.name] }]);
    expect(r.label).toBe(`Remove HorizontalPodAutoscaler ${hpa.name}`);
  });
  it('secondary nodes, blocks, the Release node and external nodes are not removable', () => {
    expect(svc.provenance?.owner).toBeTruthy();
    expect(removalOf(resolveSelection(g, svc.id)!)).toBe(null);
    expect(removalOf(resolveSelection(g, blockId(['deployments', 'hello', 'hpa']))!)).toBe(null);
    expect(removalOf(resolveSelection(g, release.id)!)).toBe(null);
    expect(removalOf(resolveSelection(gw, external.id)!)).toBe(null);
  });
});
