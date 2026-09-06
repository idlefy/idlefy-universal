import { useEffect, useRef } from 'react';
import { EngineClient } from '../engine/client';
import { buildGraph } from '../graph/build';
import type { Action, AppState } from './state';

export function useRenderPipeline(state: AppState, dispatch: (a: Action) => void) {
  const client = useRef<EngineClient | null>(null);
  // Bumped on every input change. A render started for an older revision may still complete
  // (the client only supersedes it once the next render is *sent*, after the debounce), and its
  // graph must not be dispatched over newer values — e.g. when the newer text is YAML-invalid and
  // never triggers a render of its own.
  const revision = useRef(0);
  useEffect(() => {
    const c = new EngineClient();
    client.current = c;
    c.ready.catch((e: Error) => dispatch({ type: 'engine-failed', message: e.message }));
    // A dead Go instance is permanent: same fatal panel as a failed boot, which tells the user to reload.
    c.crashed.catch((e: Error) => dispatch({ type: 'engine-failed', message: e.message }));
    return () => c.terminate();
  }, [dispatch]);

  const { text, releaseName, namespace, doc, engineError } = state;
  useEffect(() => {
    const rev = ++revision.current;
    if (engineError || doc.errors.length) return;                  // YAML invalid: keep last graph, markers show the error
    const t = setTimeout(async () => {
      dispatch({ type: 'render-start' });
      let result;
      try {
        result = await client.current!.render(text, releaseName, namespace);   // rejects only if ready rejected
      } catch (e) {
        if (rev === revision.current) dispatch({ type: 'engine-failed', message: (e as Error).message });
        return;
      }
      if (rev !== revision.current) return;                          // input moved on while this render ran
      try {
        const graph = result.ok ? buildGraph(result.manifests, doc.toJS(), namespace) : null;
        dispatch({ type: 'render-done', result, graph });
      } catch (e) {
        // A graph-building bug must not look like a dead engine: show it in the banner, keep the
        // last good graph, and let the next edit recover.
        dispatch({ type: 'render-done', result: { ok: false, error: { kind: 'template', message: 'graph: ' + (e as Error).message } }, graph: null });
      }
    }, 150);
    return () => clearTimeout(t);
  }, [text, releaseName, namespace, doc, engineError, dispatch]);
}
