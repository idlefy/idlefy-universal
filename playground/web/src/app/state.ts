import { ValuesDocument, type EditOp, type ValuesPath } from '../model/ValuesDocument';
import { SUPERSEDED, type RenderResult } from '../engine/types';
import type { GraphModel } from '../graph/types';
import type { EditorMarker } from '../editor/Editor';
import { anchorOf } from './selection';
import { samePath } from '../model/guards';
import { failText } from './banner';

export type Tier = 'basic' | 'advanced';
export type DetailTab = 'inspector' | 'yaml';

export type AppState = {
  text: string; doc: ValuesDocument; releaseName: string; namespace: string;
  render: RenderResult | null; graph: GraphModel | null; selection: string | null;
  engineError: string | null;                   // helm.wasm failed to load → full-page message
  focusPath: ValuesPath | null;                 // one-shot: the next render-done selects the node at this values path (palette add)
  editError: string | null;                     // last edit could not be applied (banner); cleared by the next text/example/successful edit
  editErrorSeq: number;                          // bumped on every editError set — App.tsx keys the banner on it so a repeated identical failure re-mounts (and role="alert" re-announces) rather than leaving an unchanged DOM node
  ui: { tier: Tier; tab: DetailTab };
};
export type Action =
  | { type: 'text'; text: string } | { type: 'example'; text: string }
  | { type: 'release'; v: string } | { type: 'ns'; v: string }
  | { type: 'render-done'; result: RenderResult; graph: GraphModel | null }
  | { type: 'select'; id: string | null }
  | { type: 'engine-failed'; message: string }
  // `focus` is the palette's one-shot focus request. It rides on the edit rather than on a second
  // action so an edit that does not land can never leave it armed for a later, unrelated render.
  | { type: 'edit'; ops: EditOp[]; focus?: ValuesPath } | { type: 'tier'; tier: Tier } | { type: 'tab'; tab: DetailTab };

/** Shown in the canvas banner when an edit could not be applied (a throw, or an insert that changed nothing). */
export const EDIT_FAILED = 'That change could not be applied to values.yaml, which was left unchanged.';

export function initialState(text: string): AppState {
  return { text, doc: ValuesDocument.parse(text), releaseName: 'demo', namespace: 'default', render: null, graph: null, selection: null, engineError: null, focusPath: null, editError: null, editErrorSeq: 0, ui: { tier: 'basic', tab: 'inspector' } };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    // Returning `s` untouched when the text is unchanged matters beyond avoiding a no-op update:
    // Monaco echoes the reducer's own new text back as a `text` action, and the identity check
    // keeps that echo from clearing `focusPath` — removing it would break Add: e2e/palette.spec.ts
    // ("add from the empty state with the keyboard, then remove") asserts the new node becomes selected.
    case 'text': return a.text === s.text ? s : { ...s, text: a.text, doc: ValuesDocument.parse(a.text), focusPath: null, editError: null };
    case 'example': return { ...s, text: a.text, doc: ValuesDocument.parse(a.text), selection: null, focusPath: null, editError: null };
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
    case 'select': return { ...s, selection: a.id, focusPath: null, editError: null };
    case 'engine-failed': return { ...s, engineError: a.message, focusPath: null };
    case 'edit': {
      // The inspector is disabled while the YAML is invalid. Text is canonical, so the
      // edited document is serialised and re-parsed rather than kept. A focus-carrying edit (the
      // palette's Add) must not vanish silently even here — it is the same "the change did not
      // land" case as the no-op check below, just caught earlier.
      if (s.doc.errors.length || a.ops.length === 0) return a.focus ? { ...s, focusPath: null, editError: EDIT_FAILED, editErrorSeq: s.editErrorSeq + 1 } : s;
      let applied: ValuesDocument;
      let text: string;
      try {
        applied = s.doc.apply(a.ops);
        text = applied.toString();
      } catch (err) {
        // Both ValuesDocument.apply() and toString() are documented to never throw — apply()'s
        // setIn/deleteIn only ever no-op on a shape they don't recognise, and toString() catches
        // yaml's own throw internally (see its `stringifyFailed` fallback below) — so this branch is
        // currently unreachable. Kept as defence-in-depth: no future EditOp[] shape may reach React's
        // render phase and blank the page.
        console.error('values edit failed', err);
        return { ...s, focusPath: null, editError: EDIT_FAILED, editErrorSeq: s.editErrorSeq + 1 };
      }
      // `applied.lostEdit` covers both ways an edit can be lost without ops.length being zero: toString()
      // had to fall back to the pre-edit source (e.g. deleting an anchored child whose alias lives
      // elsewhere leaves the document unresolvable), or setIn/deleteIn bailed on a type-mismatched
      // intermediate (e.g. a `+ container` chip against a `containers:` sequence the schema expects as a
      // map). Both are silent reverts, and per review ruling must always be surfaced regardless of
      // `focus` — including a mixed batch where one op bails but another still lands and changes the
      // text: unlike a genuine no-op this is not "nothing to apply", it is an edit that was lost.
      if (applied.lostEdit) return { ...s, focusPath: null, editError: EDIT_FAILED, editErrorSeq: s.editErrorSeq + 1 };
      // A plain widget edit that resolves to the same text is a silent no-op (Monaco echoes the
      // reducer's own text back); an *add* that changes nothing is a failure the user must see.
      if (text === s.text) return a.focus ? { ...s, focusPath: null, editError: EDIT_FAILED, editErrorSeq: s.editErrorSeq + 1 } : s;
      return { ...s, text, doc: ValuesDocument.parse(text), focusPath: a.focus ?? null, editError: null };
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
  // the editor's hover shows the same sentence the banner does; the kind/name regex above still
  // matches, because the name is in the part failText keeps
  return [{ line, col: undefined, message: failText(error.message), severity: 'error' }];
}
