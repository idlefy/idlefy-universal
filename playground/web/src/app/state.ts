import { ValuesDocument, type EditOp, type ValuesPath } from '../model/ValuesDocument';
import { SUPERSEDED, type RenderResult } from '../engine/types';
import type { GraphModel } from '../graph/types';
import type { EditorMarker } from '../editor/Editor';
import { anchorOf } from './selection';
import { samePath } from '../model/guards';

export type Tier = 'basic' | 'advanced';
export type DetailTab = 'inspector' | 'yaml';

export type AppState = {
  text: string; doc: ValuesDocument; releaseName: string; namespace: string;
  render: RenderResult | null; graph: GraphModel | null; selection: string | null;
  engineError: string | null;                   // helm.wasm failed to load → full-page message
  focusPath: ValuesPath | null;                 // one-shot: the next render-done selects the node at this values path (palette add)
  ui: { tier: Tier; tab: DetailTab };
};
export type Action =
  | { type: 'text'; text: string } | { type: 'example'; text: string }
  | { type: 'release'; v: string } | { type: 'ns'; v: string }
  | { type: 'render-done'; result: RenderResult; graph: GraphModel | null }
  | { type: 'select'; id: string | null }
  | { type: 'focus-path'; path: ValuesPath }
  | { type: 'engine-failed'; message: string }
  | { type: 'edit'; ops: EditOp[] } | { type: 'tier'; tier: Tier } | { type: 'tab'; tab: DetailTab };

export function initialState(text: string): AppState {
  return { text, doc: ValuesDocument.parse(text), releaseName: 'demo', namespace: 'default', render: null, graph: null, selection: null, engineError: null, focusPath: null, ui: { tier: 'basic', tab: 'inspector' } };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    // Returning `s` untouched when the text is unchanged matters beyond avoiding a no-op update:
    // Monaco echoes the reducer's own new text back as a `text` action, and the identity check
    // keeps that echo from clearing `focusPath` — removing it would break Add with no failing test.
    case 'text': return a.text === s.text ? s : { ...s, text: a.text, doc: ValuesDocument.parse(a.text), focusPath: null };
    case 'example': return { ...s, text: a.text, doc: ValuesDocument.parse(a.text), selection: null, focusPath: null };
    case 'release': return { ...s, releaseName: a.v };
    case 'ns': return { ...s, namespace: a.v };
    case 'render-done': {
      // A superseded request (EngineClient latest-wins) carries no information; a newer result is on its way.
      if (!a.result.ok && a.result.error.message === SUPERSEDED) return s;
      const graph = a.result.ok ? a.graph : s.graph;
      // A selected node can disappear from the rebuilt graph (renamed or removed). Group and block
      // selections are anchored to their workload and survive as long as it does.
      let selection = graph && s.selection && !anchorOf(graph, s.selection) ? null : s.selection;
      let ui = s.ui;
      // The palette's focus request is consumed by the first render after it, matched or not: a
      // failed render or a body that produced no node must not leave it armed for a later render.
      if (s.focusPath && a.result.ok && graph) {
        const hit = graph.nodes.find((n) => samePath(n.provenance?.path, s.focusPath!));
        if (hit) { selection = hit.id; ui = ui.tab === 'inspector' ? ui : { ...ui, tab: 'inspector' }; }
      }
      return { ...s, render: a.result, graph, selection, ui, focusPath: null };
    }
    case 'select': return { ...s, selection: a.id, focusPath: null };
    case 'focus-path': return { ...s, focusPath: a.path };
    case 'engine-failed': return { ...s, engineError: a.message, focusPath: null };
    case 'edit': {
      // The inspector is disabled while the YAML is invalid. Text is canonical, so the
      // edited document is serialised and re-parsed rather than kept.
      if (s.doc.errors.length || a.ops.length === 0) return s;
      const text = s.doc.apply(a.ops).toString();
      if (text === s.text) return s;
      return { ...s, text, doc: ValuesDocument.parse(text) };
    }
    case 'tier': return s.ui.tier === a.tier ? s : { ...s, ui: { ...s.ui, tier: a.tier } };
    case 'tab': return s.ui.tab === a.tab ? s : { ...s, ui: { ...s.ui, tab: a.tab } };
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
