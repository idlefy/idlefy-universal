import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import chartMeta from "../chart-bundle/chart-meta.json";
import examples from "../chart-bundle/examples.json";
import schema from "../chart-bundle/schema.json";
import { Editor, type EditorApi } from "../editor/Editor";
import { Toolbar } from "../editor/Toolbar";
import { Canvas } from "../canvas/Canvas";
import { DetailPanel } from "../canvas/DetailPanel";
import type { SchemaNode } from "../inspector/schema";
import { initialState, markersFrom, reducer } from "./state";
import { failText } from "./banner";
import { resolveSelection, titleOf } from "./selection";
import { useRenderPipeline } from "./useRenderPipeline";
import { usePanes, SplitHandle, Rail } from "./Panes";
import { AddButton, type LauncherRequest } from "../palette/AddButton";
import { EmptyState } from "../palette/EmptyState";
import { useHotkey } from "../palette/useHotkey";
import { addEntityOps } from "../palette/add";
import { useUndoRedo } from "./useUndoRedo";

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
  // inspector field look absent while the user is mid-typo. The inspector is disabled then anyway,
  // so it keeps showing the last document that parsed.
  const lastGoodDoc = useRef(state.doc);
  const inspectorDoc = useMemo(() => {
    if (state.doc.errors.length === 0) lastGoodDoc.current = state.doc;
    return lastGoodDoc.current;
  }, [state.doc]);
  const error = state.render && !state.render.ok ? state.render.error : null;
  const warnings = state.graph?.warnings ?? [];
  const { panes, setOpen, setWidth, reset } = usePanes();
  // Ctrl+Z from the canvas or the inspector drives Monaco's stack: one history, text stays canonical.
  const editorApi = useRef<EditorApi | null>(null);
  useUndoRedo(editorApi);
  // The token names the group the pill was pressed on, so a later plain selection of a group never inherits the focus request.
  const [addToken, setAddToken] = useState<{ id: string; n: number } | null>(null);
  const [launcher, setLauncher] = useState<LauncherRequest | null>(null);
  const yamlBroken = state.doc.errors.length > 0;
  const openLauncher = useCallback(() => setLauncher({}), []);
  useHotkey("a", openLauncher, !yamlBroken && !launcher);
  // AddButton renders the popover on `open && !disabled`, so a launcher left open while the YAML is
  // broken would silently re-appear — with pre-break state — the moment the user fixed the typo.
  useEffect(() => { if (yamlBroken) setLauncher(null); }, [yamlBroken]);
  // toJS() walks the whole document; only pay for it while the launcher is open.
  const values = useMemo(() => (launcher ? (inspectorDoc.toJS() as Record<string, unknown>) : {}), [launcher, inspectorDoc]);
  // Text is canonical: the launcher only produces ops; the reducer's one-shot focusPath (carried on
  // the same action, so a failed insert cannot arm it) selects the new node once it renders.
  const onAdd = useCallback((key: string, name: string) => {
    dispatch({ type: "edit", ops: addEntityOps(schema as SchemaNode, key, name), focus: [key, name] });
  }, []);
  // The editor pane is closed by default and the examples <select> lives inside it: open first, focus on the next frame.
  const loadExample = useCallback(() => {
    setOpen("editor", true);
    requestAnimationFrame(() => document.querySelector<HTMLSelectElement>('select[aria-label="examples"]')?.focus());
  }, [setOpen]);
  // Not while the YAML is broken (the banner covers that) or the render failed (the canvas error covers that);
  // Canvas itself only shows the slot when the graph has zero manifest nodes, and shows nothing before the first render.
  const emptyState = !error && !yamlBroken
    ? <EmptyState onAddDeployment={() => setLauncher({ key: "deployments" })} onLoadExample={loadExample} />
    : undefined;
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
          {/* A syntax error freezes the pipeline: without this the header keeps advertising the stale render. */}
          {yamlBroken
            ? <><span className="dot bad" aria-hidden="true" /> YAML has a syntax error</>
            : state.render?.ok && <><span className="dot ok" aria-hidden="true" /> rendered {state.render.manifests.length} objects in {state.render.durationMs} ms</>}
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
              if (!ex) return;
              setLauncher(null);   // an open launcher would keep previewing an insert into the old document
              dispatch({ type: "example", text: ex.values });
            }}
            valuesText={state.text} chartVersion={chartMeta.version} onHide={() => setOpen("editor", false)}
          />
          <Editor value={state.text} onChange={onChange} markers={markers} highlight={highlight} visible={panes.editor.open} api={editorApi} />
        </section>
        {panes.editor.open && (
          <SplitHandle label="Resize values.yaml"
            onDrag={(dx) => setWidth("editor", dragStart.current.editor + dx)} onReset={() => reset("editor")} />
        )}
        <section className="pane pane-canvas">
          {state.editError && <div className="banner warn" role="alert">{state.editError}</div>}
          {error && (() => {
            // a chart `fail` arrives as a five-line Go include chain; only its last sentence is for
            // the reader, and the chain stays one click away rather than pushing the canvas down
            const short = failText(error.message);
            return (
              <div className={`banner ${error.kind}`}>
                <pre>{short}</pre>
                {short !== error.message && (
                  <details><summary>Full template output</summary><pre>{error.message}</pre></details>
                )}
              </div>
            );
          })()}
          {!error && warnings.length > 0 && <div className="banner warn">{warnings.map((w) => <div key={w}>{w}</div>)}</div>}
          <div className="canvas-wrap">
            <AddButton disabled={yamlBroken} open={launcher} onOpen={openLauncher} onClose={() => setLauncher(null)} root={schema as SchemaNode} values={values} onAdd={onAdd} />
            <Canvas model={state.graph} booting={!state.render} stale={!!error || yamlBroken} selection={state.selection}
              onSelect={(id) => { setAddToken(null); dispatch({ type: "select", id }); if (id !== null) setOpen("inspector", true); }}
              onAddResource={(id) => { dispatch({ type: "select", id }); setOpen("inspector", true); setAddToken((t) => ({ id, n: (t?.n ?? 0) + 1 })); }}
              emptyState={emptyState} />
          </div>
        </section>
        {sel && panes.inspector.open && (
          <>
            <SplitHandle label="Resize the inspector"
              onDrag={(dx) => setWidth("inspector", dragStart.current.inspector - dx)} onReset={() => reset("inspector")} />
            <section className="pane" style={{ width: panes.inspector.width }}>
              <DetailPanel
                sel={sel} nodes={state.graph?.nodes ?? []} tab={state.ui.tab} tier={state.ui.tier} doc={inspectorDoc} root={schema as SchemaNode}
                disabled={yamlBroken} focusToken={addToken && addToken.id === state.selection ? addToken.n : 0}
                onTab={(tab) => dispatch({ type: "tab", tab })} onTier={(tier) => dispatch({ type: "tier", tier })}
                onEdit={(ops) => dispatch({ type: "edit", ops })}
                onSelect={(id) => { setAddToken(null); dispatch({ type: "select", id }); setOpen("inspector", true); }}
                onClose={() => dispatch({ type: "select", id: null })}
                onHide={() => setOpen("inspector", false)}
              />
            </section>
          </>
        )}
        {sel && !panes.inspector.open && (() => {
          const t = titleOf(sel);
          return <Rail side="right" name="the inspector" label={`${t.name} · ${t.kind}`} onOpen={() => setOpen("inspector", true)} />;
        })()}
      </div>
    </div>
  );
}
