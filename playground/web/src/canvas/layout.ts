import ELK from 'elkjs/lib/elk.bundled.js';
import type { Edge, Node } from '@xyflow/react';
import type { GraphModel, GraphNode } from '../graph/types';

export type ResourceNodeData = { node: GraphNode; dimmed: boolean };
const elk = new ELK();
export const NODE_W = 200,
  NODE_H = 56;

export async function layoutGraph(model: GraphModel): Promise<{ nodes: Node<ResourceNodeData>[]; edges: Edge[] }> {
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
    },
    children: model.nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
    edges: model.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const res = await elk.layout(graph);
  const pos = new Map((res.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  return {
    nodes: model.nodes.map((n) => ({
      id: n.id,
      type: 'resource',
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      // React Flow hides a node it has not measured yet. Canvas rebuilds the node
      // objects on every hover/selection change, so without explicit dimensions the
      // hovered node blinks out, fires mouseleave, and swallows the click that
      // follows. The size is fixed by `.rnode` in styles.css.
      width: NODE_W,
      height: NODE_H,
      data: { node: n, dimmed: false },
      draggable: false,
    })),
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
