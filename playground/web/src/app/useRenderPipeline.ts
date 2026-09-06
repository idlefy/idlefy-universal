import { useEffect, useRef } from 'react';
import { EngineClient } from '../engine/client';
import { buildGraph } from '../graph/build';
import type { Action, AppState } from './state';

export function useRenderPipeline(state: AppState, dispatch: (a: Action) => void) {
  const client = useRef<EngineClient | null>(null);
  useEffect(() => {
    const c = new EngineClient();
    client.current = c;
    c.ready.catch((e: Error) => dispatch({ type: 'engine-failed', message: e.message }));
    return () => c.terminate();
  }, [dispatch]);

  const { text, releaseName, namespace, doc, engineError } = state;
  useEffect(() => {
    if (engineError || doc.errors.length) return;                  // YAML invalid: keep last graph, markers show the error
    const t = setTimeout(async () => {
      dispatch({ type: 'render-start' });
      try {
        const result = await client.current!.render(text, releaseName, namespace);   // rejects only if ready rejected
        const graph = result.ok ? buildGraph(result.manifests, doc.toJS(), namespace) : null;
        dispatch({ type: 'render-done', result, graph });
      } catch (e) {
        dispatch({ type: 'engine-failed', message: (e as Error).message });
      }
    }, 150);
    return () => clearTimeout(t);
  }, [text, releaseName, namespace, doc, engineError, dispatch]);
}
