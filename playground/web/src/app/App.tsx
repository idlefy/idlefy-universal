import { useCallback, useMemo, useReducer } from "react";
import chartMeta from "../chart-bundle/chart-meta.json";
import examples from "../chart-bundle/examples.json";
import { Editor } from "../editor/Editor";
import { Toolbar } from "../editor/Toolbar";
import { Canvas } from "../canvas/Canvas";
import { DetailPanel } from "../canvas/DetailPanel";
import { initialState, markersFrom, reducer } from "./state";
import { useRenderPipeline } from "./useRenderPipeline";

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
  const selected =
    state.graph?.nodes.find((n) => n.id === state.selection) ?? null;
  const revealLine = selected?.provenance
    ? state.doc.lineOf(selected.provenance.path)
    : null;
  const error = state.render && !state.render.ok ? state.render.error : null;
  const warnings = state.graph?.warnings ?? [];

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
        <strong>idlefy-universal playground</strong> · chart {chartMeta.version}
        {state.render?.ok && (
          <span className="muted">
            {" "}
            · rendered {state.render.manifests.length} objects in{" "}
            {state.render.durationMs} ms
          </span>
        )}
        <a className="muted" href="../" style={{ marginLeft: "auto" }}>
          docs
        </a>
      </header>
      <div className="split">
        <section className="pane-left">
          <Toolbar
            release={state.releaseName}
            ns={state.namespace}
            onRelease={(v) => dispatch({ type: "release", v })}
            onNs={(v) => dispatch({ type: "ns", v })}
            onPickExample={(id) => {
              const ex = (examples as { id: string; values: string }[]).find(
                (e) => e.id === id,
              );
              if (ex) dispatch({ type: "example", id, text: ex.values });
            }}
            valuesText={state.text}
            chartVersion={chartMeta.version}
          />
          <Editor
            value={state.text}
            onChange={onChange}
            markers={markers}
            revealLine={revealLine}
          />
        </section>
        <section className="pane-right">
          {error && (
            <div className={`banner ${error.kind}`}>
              <pre>{error.message}</pre>
            </div>
          )}
          {!error && warnings.length > 0 && (
            <div className="banner warn">
              {warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
          )}
          <Canvas
            model={state.graph}
            stale={!!error || state.doc.errors.length > 0}
            selection={state.selection}
            onSelect={(id) => dispatch({ type: "select", id })}
          />
          <DetailPanel
            node={selected}
            onClose={() => dispatch({ type: "select", id: null })}
          />
        </section>
      </div>
    </div>
  );
}
