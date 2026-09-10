import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  booting,
  stale,
  selection,
  onSelect,
  onAddResource,
  emptyState,
}: {
  model: GraphModel | null;
  booting: boolean;
  stale: boolean;
  selection: string | null;
  onSelect: (id: string | null) => void;
  onAddResource: (groupId: string) => void;
  emptyState?: ReactNode;
}) {
  // `model` is tracked alongside the layout so the empty card is never decided from a model whose
  // ELK layout has not landed yet — otherwise it paints over the previous graph for one tick. `empty`
  // is the emptiness of *that* completed layout's model, kept around so the card is not withheld
  // during the gap of a later, still-empty model's own layout still being in flight — see the render
  // check below for why that gap otherwise strobes the card while typing over an empty document.
  const [laid, setLaid] = useState<{ nodes: AppNode[]; edges: Edge[]; model: GraphModel | null; empty: boolean }>({
    nodes: [],
    edges: [],
    model: null,
    empty: false,
  });
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const isEmpty = (m: GraphModel) => m.nodes.filter((n) => n.manifest).length === 0;

  useEffect(() => {
    let alive = true;
    if (!model) return;
    layoutGraph(model)
      .then((r) => {
        if (alive) {
          setLaid({ ...r, model, empty: isEmpty(model) });
          setLayoutError(null);
        }
      })
      .catch((e) => {
        if (alive) {
          setLaid({ nodes: [], edges: [], model, empty: isEmpty(model) });
          setLayoutError(e instanceof Error ? e.message : String(e));
          console.error("layout failed", e);
        }
      });
    return () => {
      alive = false;
    };
  }, [model]);

  // Node selections dim non-neighbours; group and block selections dim nothing.
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
        {booting
          ? "Starting the Helm engine…"
          : "Paste or pick an example on the left to see the resources it produces."}
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
          // (its empty interior included) selects the group.
          onNodeClick={(_, n) => onSelect(n.id)}
          onPaneClick={() => onSelect(null)}
          nodesConnectable={false}
          // No proOptions: hiding React Flow's attribution requires a Pro subscription, and this repo documents none.
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
      {/* `laid.model === model`: the layout on screen actually is this model's, the normal case.
          `laid.empty`: the layout in flight for *this* model has not landed yet, but the last one
          that did was already empty too — continuous typing over an empty document produces a new
          (still empty) model on every keystroke, and gating on `laid.model === model` alone would
          hide and reshow the card on every one of those async gaps instead of leaving it be. */}
      {!layoutError && (laid.model === model || laid.empty) && isEmpty(model) && (
        emptyState ?? <div className="canvas-empty overlay">No resources rendered yet.</div>
      )}
    </div>
  );
}
