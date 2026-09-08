import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import chartMeta from "../chart-bundle/chart-meta.json";
import examples from "../chart-bundle/examples.json";
import schema from "../chart-bundle/schema.json";
import { Editor } from "../editor/Editor";
import { Toolbar } from "../editor/Toolbar";
import { Canvas } from "../canvas/Canvas";
import { DetailPanel } from "../canvas/DetailPanel";
import type { SchemaNode } from "../inspector/schema";
import { initialState, markersFrom, reducer } from "./state";
import { resolveSelection, titleOf } from "./selection";
import { useRenderPipeline } from "./useRenderPipeline";
import { usePanes, SplitHandle, Rail } from "./Panes";

const FIRST = (examples as { id: string; values: string }[])[0];

export function App() {
  const [state, dispatch] = useReducer(
    reducer,
    FIRST?.values ?? "deployments: {}\n",
    initialState,
  );
  useRenderPipeline(state, dispatch);
  const onChange = useCallback(
    (text: string) => dispatch({ type: "text", text }),
    [],
  );
  const markers = useMemo(() => markersFrom(state), [state.doc, state.render]); // markersFrom reads only these two
  const sel = useMemo(() => resolveSelection(state.graph, state.selection), [state.graph, state.selection]);
  const selPath = sel?.kind === "node" ? sel.node.provenance?.path : sel?.kind === "group" ? sel.group.owner.provenance?.path : sel?.path;
  // state.doc is a new object on every keystroke; memoise on the line numbers so the editor effect
  // (which scrolls) only re-runs when the block actually moves.
  const range = selPath ? state.doc.rangeOf(selPath) : null;
  const hStart = range?.start ?? null, hEnd = range?.end ?? null;
  const highlight = useMemo(() => (hStart === null || hEnd === null ? null : { start: hStart, end: hEnd }), [hStart, hEnd]);
  // A document with syntax errors reads as empty (`toJS()` gives `{}`), which would make every
  // inspector field look absent while the user is mid-typo. The inspector is disabled then anyway
  // (spec §6), so it keeps showing the last document that parsed.
  const lastGoodDoc = useRef(state.doc);
  const inspectorDoc = useMemo(() => {
    if (state.doc.errors.length === 0) lastGoodDoc.current = state.doc;
    return lastGoodDoc.current;
  }, [state.doc]);
  const error = state.render && !state.render.ok ? state.render.error : null;
  const warnings = state.graph?.warnings ?? [];
  const { panes, setOpen, setWidth, reset } = usePanes();
  // The token names the group the pill was pressed on, so a later plain selection of a group never inherits the focus request.
  const [addToken, setAddToken] = useState<{ id: string; n: number } | null>(null);
  // A node click always shows the inspector, even after the user collapsed it for the previous node.
  useEffect(() => { if (state.selection) setOpen("inspector", true); }, [state.selection, setOpen]);
  const dragStart = useRef<{ editor: number; inspector: number }>({ editor: 0, inspector: 0 });
  useEffect(() => {
    const snap = () => { dragStart.current = { editor: panes.editor.width, inspector: panes.inspector.width }; };
    document.addEventListener("pointerdown", snap, true);
    return () => document.removeEventListener("pointerdown", snap, true);
  }, [panes.editor.width, panes.inspector.width]);
  const lineCount = useMemo(() => state.text.split("\n").length, [state.text]);

  if (state.engineError) {
    return (
      <div className="fatal">
        <h1>The Helm engine is unavailable</h1>
        <p>{state.engineError}</p>
        <p>
          Reload the page to try again. The playground needs WebAssembly and a
          working network path to <code>helm.wasm</code>; you can also read the{" "}
          <a href="../">documentation</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header>
        <strong>idlefy-universal playground</strong>
        <span className="muted">chart {chartMeta.version}</span>
        <div className="pane-buttons" role="group" aria-label="panes">
          <button type="button" className={panes.editor.open ? "on" : ""} aria-pressed={panes.editor.open} onClick={() => setOpen("editor", !panes.editor.open)}>YAML</button>
          <button type="button" className="on" aria-pressed="true" disabled>Graph</button>
          <button type="button" className={sel && panes.inspector.open ? "on" : ""} aria-pressed={!!sel && panes.inspector.open} disabled={!sel}
            onClick={() => setOpen("inspector", !panes.inspector.open)}>Inspector</button>
        </div>
        <span className="status">
          {state.render?.ok && <><span className="dot ok" aria-hidden="true" /> rendered {state.render.manifests.length} objects in {state.render.durationMs} ms</>}
          <a className="muted" href="../">docs</a>
        </span>
      </header>
      <div className="panes">
        {!panes.editor.open && <Rail side="left" name="values.yaml" label={`values.yaml · ${lineCount} lines`} onOpen={() => setOpen("editor", true)} />}
        {/* kept mounted while collapsed so Monaco's undo stack survives */}
        <section className="pane pane-editor" hidden={!panes.editor.open} style={{ width: panes.editor.width }}>
          <Toolbar
            release={state.releaseName} ns={state.namespace}
            onRelease={(v) => dispatch({ type: "release", v })} onNs={(v) => dispatch({ type: "ns", v })}
            onPickExample={(id) => {
              const ex = (examples as { id: string; values: string }[]).find((e) => e.id === id);
              if (ex) dispatch({ type: "example", id, text: ex.values });
            }}
            valuesText={state.text} chartVersion={chartMeta.version} onHide={() => setOpen("editor", false)}
          />
          <Editor value={state.text} onChange={onChange} markers={markers} highlight={highlight} visible={panes.editor.open} />
        </section>
        {panes.editor.open && (
          <SplitHandle label="Resize values.yaml"
            onDrag={(dx) => setWidth("editor", dragStart.current.editor + dx)} onReset={() => reset("editor")} />
        )}
        <section className="pane pane-canvas">
          {error && <div className={`banner ${error.kind}`}><pre>{error.message}</pre></div>}
          {!error && warnings.length > 0 && <div className="banner warn">{warnings.map((w) => <div key={w}>{w}</div>)}</div>}
          <Canvas model={state.graph} stale={!!error || state.doc.errors.length > 0} selection={state.selection}
            onSelect={(id) => { setAddToken(null); dispatch({ type: "select", id }); if (id !== null) setOpen("inspector", true); }}
            onAddResource={(id) => { dispatch({ type: "select", id }); setOpen("inspector", true); setAddToken((t) => ({ id, n: (t?.n ?? 0) + 1 })); }} />
        </section>
        {sel && panes.inspector.open && (
          <>
            <SplitHandle label="Resize the inspector"
              onDrag={(dx) => setWidth("inspector", dragStart.current.inspector - dx)} onReset={() => reset("inspector")} />
            <section className="pane pane-inspector" style={{ width: panes.inspector.width }}>
              <DetailPanel
                sel={sel} nodes={state.graph?.nodes ?? []} tab={state.ui.tab} tier={state.ui.tier} doc={inspectorDoc} root={schema as SchemaNode}
                disabled={state.doc.errors.length > 0} focusToken={addToken && addToken.id === state.selection ? addToken.n : 0}
                onTab={(tab) => dispatch({ type: "tab", tab })} onTier={(tier) => dispatch({ type: "tier", tier })}
                onEdit={(ops) => dispatch({ type: "edit", ops })}
                onSelect={(id) => { setAddToken(null); dispatch({ type: "select", id }); setOpen("inspector", true); }}
                onClose={() => dispatch({ type: "select", id: null })}
                onHide={() => setOpen("inspector", false)}
              />
            </section>
          </>
        )}
        {sel && !panes.inspector.open && (
          <Rail side="right" name="the inspector" label={`${titleOf(sel).name} · ${titleOf(sel).kind}`} onOpen={() => setOpen("inspector", true)} />
        )}
      </div>
    </div>
  );
}
