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
import { CanvasActions } from "./actions";
import { isGroupId, isBlockId } from "../app/selection";

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
  onAddResource,
}: {
  model: GraphModel | null;
  stale: boolean;
  selection: string | null;
  onSelect: (id: string | null) => void;
  onAddResource: (groupId: string) => void;
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

  // spec 2026-09-08 §2.3: node selections dim non-neighbours; group and block selections dim nothing.
  const focus = selection && !isGroupId(selection) && !isBlockId(selection) ? selection : null;
  const { nodes, edges } = useMemo(() => {
    const near = new Set<string>(focus ? [focus] : []);
    if (focus) for (const e of laid.edges) {
      if (e.source === focus) near.add(e.target);
      if (e.target === focus) near.add(e.source);
    }
    return {
      nodes: laid.nodes.map((n) =>
        n.type === "resource"
          ? { ...n, data: { ...n.data, dimmed: focus ? !near.has(n.id) : false }, selected: n.id === selection }
          : { ...n, selected: n.id === selection },
      ),
      edges: laid.edges.map((e) => ({ ...e, style: { ...e.style, opacity: !focus || e.source === focus || e.target === focus ? 1 : 0.15 } })),
    };
  }, [laid, selection, focus]);
  const actions = useMemo(() => ({ select: onSelect, addResource: onAddResource }), [onSelect, onAddResource]);

  if (!model)
    return (
      <div className="canvas-empty">
        Paste or pick an example on the left to see the resources it produces.
      </div>
    );
  return (
    <div className={`canvas ${stale ? "stale" : ""}`}>
      <CanvasActions.Provider value={actions}>
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
          // React Flow fires these for `selectable: false` nodes too; a click anywhere inside a group
          // (its empty interior included) selects the group (spec 2026-09-08 §2.3).
          onNodeClick={(_, n) => onSelect(n.id)}
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
      </CanvasActions.Provider>
      {layoutError && (
        <div className="canvas-error">Layout failed: {layoutError}</div>
      )}
      {!layoutError && model.nodes.filter((n) => n.manifest).length === 0 && (
        <div className="canvas-empty overlay">No resources rendered yet.</div>
      )}
    </div>
  );
}
