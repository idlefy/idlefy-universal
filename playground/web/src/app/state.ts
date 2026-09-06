import { ValuesDocument } from '../model/ValuesDocument';
import { SUPERSEDED, type RenderResult } from '../engine/types';   // types.ts has no side effects, so this test stays bundle-free
import type { GraphModel } from '../graph/types';
import type { EditorMarker } from '../editor/Editor';

export type AppState = {
  text: string; doc: ValuesDocument; releaseName: string; namespace: string;
  render: RenderResult | null; graph: GraphModel | null; selection: string | null; exampleId: string | null; rendering: boolean;
  engineError: string | null;                   // helm.wasm failed to load → full-page message
};
export type Action =
  | { type: 'text'; text: string } | { type: 'example'; id: string; text: string }
  | { type: 'release'; v: string } | { type: 'ns'; v: string }
  | { type: 'render-start' } | { type: 'render-done'; result: RenderResult; graph: GraphModel | null }
  | { type: 'select'; id: string | null }
  | { type: 'engine-failed'; message: string };

export function initialState(text: string): AppState {
  return { text, doc: ValuesDocument.parse(text), releaseName: 'demo', namespace: 'default', render: null, graph: null, selection: null, exampleId: null, rendering: false, engineError: null };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'text': return a.text === s.text ? s : { ...s, text: a.text, doc: ValuesDocument.parse(a.text) };
    case 'example': return { ...s, text: a.text, doc: ValuesDocument.parse(a.text), exampleId: a.id, selection: null };
    case 'release': return { ...s, releaseName: a.v };
    case 'ns': return { ...s, namespace: a.v };
    case 'render-start': return { ...s, rendering: true };
    case 'render-done':
      // A superseded request (EngineClient latest-wins) carries no information; a newer result is on its way.
      if (!a.result.ok && a.result.error.message === SUPERSEDED) return s;
      return { ...s, rendering: false, render: a.result, graph: a.result.ok ? a.graph : s.graph };
    case 'select': return { ...s, selection: a.id };
    case 'engine-failed': return { ...s, rendering: false, engineError: a.message };
  }
}

/** JSON Pointer → values path (unescapes ~1 and ~0). */
export function pointerToPath(p: string): (string | number)[] {
  return p.split('/').slice(1).map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~')).map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
}

export function markersFrom(s: AppState): EditorMarker[] {
  if (s.doc.errors.length) return s.doc.errors.map((e) => ({ line: e.line, col: e.col, message: e.message, severity: 'error' as const }));
  if (!s.render || s.render.ok) return [];
  const { error } = s.render;
  let line = 1;
  if (error.kind === 'schema' && error.path) line = s.doc.lineOf(pointerToPath(error.path)) ?? 1;
  if (error.kind === 'template') {
    const m = error.message.match(/(?:Deployment|StatefulSet|DaemonSet|Job|CronJob|Ingress|HTTPRoute) ([a-z0-9-]+)/);
    const kindKey: Record<string, string> = { Deployment: 'deployments', StatefulSet: 'statefulSets', DaemonSet: 'daemonSets', Job: 'jobs', CronJob: 'cronJobs', Ingress: 'ingresses', HTTPRoute: 'httpRoutes' };
    if (m) { const kk = kindKey[m[0].split(' ')[0]]; line = s.doc.lineOf([kk, m[1]]) ?? 1; }
  }
  return [{ line, col: undefined, message: error.message, severity: 'error' }];
}
