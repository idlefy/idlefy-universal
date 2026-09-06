import { describe, it, expect } from 'vitest';
import { layoutGraph } from '../src/canvas/layout';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';

describe('layoutGraph', () => {
  it('assigns distinct positions to every node', async () => {
    const { manifests, values } = loadFixture('full-features');
    const { nodes, edges } = await layoutGraph(buildGraph(manifests, values, 'default'));
    expect(nodes.length).toBeGreaterThan(15);
    expect(nodes.every((n) => Number.isFinite(n.position.x) && Number.isFinite(n.position.y))).toBe(true);
    const pos = new Set(nodes.map((n) => `${Math.round(n.position.x)},${Math.round(n.position.y)}`));
    expect(pos.size).toBe(nodes.length);
    expect(edges.length).toBeGreaterThan(10);
  });
});
