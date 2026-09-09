import { describe, it, expect } from 'vitest';
import { layoutGraph, NODE_W, NODE_H } from '../src/canvas/layout';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';

describe('layoutGraph', () => {
  it('assigns distinct positions to every node', async () => {
    const { manifests, values } = loadFixture('full-features');
    const model = buildGraph(manifests, values, 'default');
    const { nodes, edges } = await layoutGraph(model);
    expect(nodes.length).toBeGreaterThan(15);
    expect(nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
    // group positions are root-relative while child positions are parent-relative, so the two
    // coordinate spaces collide; compare within each space.
    const key = (n: { parentId?: string; position: { x: number; y: number } }) => `${n.parentId ?? 'root'}|${Math.round(n.position.x)},${Math.round(n.position.y)}`;
    const pos = new Set(nodes.map(key));
    expect(pos.size).toBe(nodes.length);
    expect(nodes.every((n) => n.draggable === false)).toBe(true);
    expect(edges.length).toBe(model.edges.length);
    expect(edges.length).toBeGreaterThan(10);
  });
  it('emits group nodes before their children with relative positions', async () => {
    const { manifests, values } = loadFixture('stateful-storage');
    const model = buildGraph(manifests, values, 'default');
    const { nodes } = await layoutGraph(model);
    const group = nodes.find((n) => n.id === 'group:default/Deployment/web')!;
    expect(group.type).toBe('group');
    expect(group.data).toEqual({ kind: 'Deployment', name: 'web' });
    const child = nodes.find((n) => n.id === 'default/Service/web')!;
    expect(child.parentId).toBe(group.id);
    expect(child.extent).toBe('parent');
    expect(nodes.indexOf(group)).toBeLessThan(nodes.indexOf(child));
    // elkjs silently ignores malformed layout options, so assert the actual padding offset (top=36, left=12)
    expect(child.position.x).toBeGreaterThanOrEqual(12);
    expect(child.position.y).toBeGreaterThanOrEqual(36);
    expect(child.position.x + NODE_W).toBeLessThanOrEqual((group.width as number) + 1);
    expect(nodes.find((n) => n.id === 'default/PersistentVolumeClaim/uploads')!.parentId).toBeUndefined();
    // Deployment/files owns nothing but still sits in its own group (spec 2026-09-08 §2.1)
    const files = nodes.find((n) => n.id === 'group:default/Deployment/files')!;
    expect(files.type).toBe('group');
    expect(nodes.find((n) => n.id === 'default/Deployment/files')!.parentId).toBe(files.id);
  });
  it('keeps every child inside its group and never overlaps siblings (full-features, intra-group edges)', async () => {
    const { manifests, values } = loadFixture('full-features');
    const { nodes } = await layoutGraph(buildGraph(manifests, values, 'default'));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      if (!n.parentId) continue;
      const g = byId.get(n.parentId)!;
      expect(n.position.x).toBeGreaterThanOrEqual(0);
      expect(n.position.y).toBeGreaterThanOrEqual(0);
      expect(n.position.x + NODE_W).toBeLessThanOrEqual((g.width as number) + 1);
      expect(n.position.y + NODE_H).toBeLessThanOrEqual((g.height as number) + 1);
    }
    const kids = nodes.filter((n) => n.type === 'resource');
    for (const a of kids) for (const b of kids) {
      if (a === b || a.parentId !== b.parentId) continue;
      const apart = a.position.x + NODE_W <= b.position.x || b.position.x + NODE_W <= a.position.x || a.position.y + NODE_H <= b.position.y || b.position.y + NODE_H <= a.position.y;
      expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
    }
  });
});
