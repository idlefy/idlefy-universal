import ELK from 'elkjs/lib/elk.bundled.js';
import type { Edge, Node } from '@xyflow/react';
import type { GraphModel, GraphNode } from '../graph/types';
import { groupsOf } from '../graph/groups';

export type ResourceNodeData = { node: GraphNode; dimmed: boolean };
export type GroupNodeData = { label: string; kind: string; name: string; ownerId: string };
/** Discriminated union: `n.type` narrows `n.data`, so the canvas never has to widen either side. */
export type AppNode = Node<ResourceNodeData, 'resource'> | Node<GroupNodeData, 'group'>;
const elk = new ELK();
/** The size is fixed by .rnode in styles.css */
export const NODE_W = 178,
  NODE_H = 48;
const PAD = { top: 36, side: 12, bottom: 12 };

export async function layoutGraph(model: GraphModel): Promise<{ nodes: AppNode[]; edges: Edge[] }> {
  const groups = groupsOf(model);
  const parentOf = new Map<string, string>();
  for (const g of groups) {
    parentOf.set(g.owner.id, g.id);
    for (const m of g.members) parentOf.set(m.id, g.id);
  }
  const leaf = (n: GraphNode) => ({ id: n.id, width: NODE_W, height: NODE_H });
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: [
      ...groups.map((g) => ({
        id: g.id,
        // per-node elk.direction is a no-op under INCLUDE_CHILDREN (the root's direction applies to the whole hierarchy)
        layoutOptions: { 'elk.padding': `[top=${PAD.top},left=${PAD.side},bottom=${PAD.bottom},right=${PAD.side}]` },
        children: [leaf(g.owner), ...g.members.map(leaf)],
      })),
      ...model.nodes.filter((n) => !parentOf.has(n.id)).map(leaf),
    ],
    edges: model.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  // ELK expects an edge in the lowest common ancestor of its endpoints; under INCLUDE_CHILDREN it
  // accepts every edge on the root, including the cross-container ones.
  const res = await elk.layout(graph);
  // ELK reports child coordinates relative to their parent, which is exactly what React Flow's parentId expects.
  const pos = new Map<string, { x: number; y: number; width?: number; height?: number }>();
  const walk = (children: { id: string; x?: number; y?: number; width?: number; height?: number; children?: unknown }[] | undefined) => {
    for (const c of children ?? []) {
      pos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, width: c.width, height: c.height });
      walk(c.children as Parameters<typeof walk>[0]);
    }
  };
  walk(res.children);
  // React Flow renders parents before children (array order), so no zIndex is needed; a negative one would push the box behind edges.
  const groupNodes: AppNode[] = groups.map((g) => {
    const p = pos.get(g.id)!;
    return {
      id: g.id,
      type: 'group',
      position: { x: p.x, y: p.y },
      width: p.width,
      height: p.height,
      data: { label: `${g.owner.kind} ${g.owner.name}`, kind: g.owner.kind, name: g.owner.name, ownerId: g.owner.id },
      selectable: false,
      draggable: false,
    };
  });
  const resourceNodes: AppNode[] = model.nodes.map((n) => {
    const p = pos.get(n.id) ?? { x: 0, y: 0 };
    const parentId = parentOf.get(n.id);
    return {
      id: n.id,
      type: 'resource',
      position: { x: p.x, y: p.y },
      // React Flow hides a node it has not measured yet. Canvas rebuilds the node
      // objects on every selection change, so without explicit dimensions a node
      // would blink out and back in on each click. The size is fixed by `.rnode`
      // in styles.css.
      width: NODE_W,
      height: NODE_H,
      data: { node: n, dimmed: false },
      draggable: false,
      ...(parentId ? { parentId, extent: 'parent' as const } : {}),
    };
  });
  return {
    nodes: [...groupNodes, ...resourceNodes],
    edges: model.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'smoothstep',
      animated: e.relation === 'precedes',
      style: { strokeDasharray: model.nodes.find((n) => n.id === e.target)?.external ? '6 4' : undefined },
    })),
  };
}
