import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphModel } from '../graph/types';
import { layoutGraph, type ResourceNodeData } from './layout';
import { ResourceNode } from './ResourceNode';

const nodeTypes = { resource: ResourceNode };

export function Canvas({
  model,
  stale,
  selection,
  onSelect,
}: {
  model: GraphModel | null;
  stale: boolean;
  selection: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [laid, setLaid] = useState<{ nodes: Node<ResourceNodeData>[]; edges: Edge[] }>({ nodes: [], edges: [] });
  const [hover, setHover] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!model) return;
    layoutGraph(model)
      .then((r) => {
        if (alive) {
          setLaid(r);
          setLayoutError(null);
        }
      })
      .catch((e) => {
        if (alive) {
          setLaid({ nodes: [], edges: [] });
          setLayoutError(e instanceof Error ? e.message : String(e));
          console.error('layout failed', e);
        }
      });
    return () => {
      alive = false;
    };
  }, [model]);

  const focus = hover ?? selection;
  const { nodes, edges } = useMemo(() => {
    if (!focus) return laid;
    const near = new Set<string>([focus]);
    for (const e of laid.edges) {
      if (e.source === focus) near.add(e.target);
      if (e.target === focus) near.add(e.source);
    }
    return {
      nodes: laid.nodes.map((n) => ({ ...n, data: { ...n.data, dimmed: !near.has(n.id) }, selected: n.id === selection })),
      edges: laid.edges.map((e) => ({ ...e, style: { ...e.style, opacity: e.source === focus || e.target === focus ? 1 : 0.15 } })),
    };
  }, [laid, focus, selection]);

  if (!model) return <div className="canvas-empty">Paste or pick an example on the left to see the resources it produces.</div>;
  return (
    <div className={`canvas ${stale ? 'stale' : ''}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        onNodeClick={(_, n) => onSelect(n.id)}
        onPaneClick={() => onSelect(null)}
        onNodeMouseEnter={(_, n) => setHover(n.id)}
        onNodeMouseLeave={() => setHover(null)}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
      {layoutError && <div className="canvas-error">Layout failed: {layoutError}</div>}
      {!layoutError && model.nodes.filter((n) => n.manifest).length === 0 && (
        <div className="canvas-empty overlay">No resources rendered yet.</div>
      )}
    </div>
  );
}
