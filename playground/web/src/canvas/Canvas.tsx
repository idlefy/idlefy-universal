import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  useStore,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphModel } from "../graph/types";
import { layoutGraph, type AppNode } from "./layout";
import { ResourceNode } from "./ResourceNode";
import { GroupNode } from "./GroupNode";

const nodeTypes = { resource: ResourceNode, group: GroupNode };
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Re-fit the viewport whenever a new layout lands or the canvas box changes size (pane open/close/drag, window resize). */
function FitOnLayout({ token }: { token: unknown }) {
  const { fitView } = useReactFlow();
  const box = useStore((s) => `${Math.round(s.width)}x${Math.round(s.height)}`);
  useEffect(() => { void fitView({ padding: 0.15, duration: reduceMotion() ? 0 : 200 }); }, [token, fitView]);
  useEffect(() => {
    const id = requestAnimationFrame(() => void fitView({ padding: 0.15, duration: reduceMotion() ? 0 : 150 }));
    return () => cancelAnimationFrame(id);
  }, [box, fitView]);
  return null;
}

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
  const [laid, setLaid] = useState<{ nodes: AppNode[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });
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
          console.error("layout failed", e);
        }
      });
    return () => {
      alive = false;
    };
  }, [model]);

  const focus = selection;
  const { nodes, edges } = useMemo(() => {
    if (!focus) return laid;
    const near = new Set<string>([focus]);
    for (const e of laid.edges) {
      if (e.source === focus) near.add(e.target);
      if (e.target === focus) near.add(e.source);
    }
    return {
      // group containers are decoration: they never dim and never carry a selection.
      nodes: laid.nodes.map((n) =>
        n.type === "resource"
          ? {
              ...n,
              data: { ...n.data, dimmed: !near.has(n.id) },
              selected: n.id === selection,
            }
          : n,
      ),
      edges: laid.edges.map((e) => ({
        ...e,
        style: {
          ...e.style,
          opacity: e.source === focus || e.target === focus ? 1 : 0.15,
        },
      })),
    };
  }, [laid, selection]);

  if (!model)
    return (
      <div className="canvas-empty">
        Paste or pick an example on the left to see the resources it produces.
      </div>
    );
  return (
    <div className={`canvas ${stale ? "stale" : ""}`}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          colorMode="system"
          minZoom={0.2}
          maxZoom={1.25}
          // React Flow fires these for `selectable: false` nodes too, and a group id matches no
          // GraphModel node (it would close the detail panel and dim everything).
          onNodeClick={(_, n) => {
            if (n.type !== "group") onSelect(n.id);
          }}
          onPaneClick={() => onSelect(null)}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
          {model.nodes.length >= 12 && <MiniMap pannable zoomable />}
          <FitOnLayout token={laid} />
        </ReactFlow>
      </ReactFlowProvider>
      {layoutError && (
        <div className="canvas-error">Layout failed: {layoutError}</div>
      )}
      {!layoutError && model.nodes.filter((n) => n.manifest).length === 0 && (
        <div className="canvas-empty overlay">No resources rendered yet.</div>
      )}
    </div>
  );
}
