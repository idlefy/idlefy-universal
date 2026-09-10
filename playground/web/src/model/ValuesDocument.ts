import { Document, parseDocument, isMap, isSeq, isPair, LineCounter } from 'yaml';

export type ValuesPath = (string | number)[];

export type EditOp = { op: 'set'; path: ValuesPath; value: unknown } | { op: 'delete'; path: ValuesPath };

/**
 * `yaml` stringifies with `ctx.inFlow ?? collection.flow`, so a child's own `flow` flag can never
 * beat a flow ancestor: the only way to keep an insert block-style is to un-flow the flow parent
 * itself. Doing that only while it is still *empty* (`{}`, `[]`) costs nothing — an empty
 * collection has no style worth preserving — while a non-empty flow map the user typed keeps it.
 */
function unflowIfEmpty(node: any): void {
  if ((isMap(node) || isSeq(node)) && node.flow && node.items.length === 0) node.flow = false;
}

export class ValuesDocument {
  private doc: Document;
  private lc: LineCounter;
  private source: string;
  readonly errors: { message: string; line: number; col: number }[];

  private constructor(doc: Document, lc: LineCounter, source: string, errors: { message: string; line: number; col: number }[]) {
    this.doc = doc;
    this.lc = lc;
    this.source = source;
    this.errors = errors;
  }

  static parse(text: string): ValuesDocument {
    const lc = new LineCounter();
    const doc = parseDocument(text, { lineCounter: lc, keepSourceTokens: false });
    const errors = doc.errors.map((e) => {
      const pos = e.pos?.[0] ?? 0;
      const { line, col } = lc.linePos(pos);
      return { message: e.message, line, col };
    });
    return new ValuesDocument(doc, lc, text, errors);
  }

  toJS(): any {
    if (this.errors.length) return {};
    const js = this.doc.toJS();
    return js && typeof js === 'object' ? js : {};
  }
  setIn(path: ValuesPath, value: unknown): void {
    if (path.length === 0) return;

    // Root: only replace with an empty map when the document currently has no
    // content at all (null/undefined, e.g. an empty document). A root that is
    // already a sequence or a scalar is left untouched — silently overwriting
    // the user's whole document root would be too surprising — so setIn is a
    // no-op in that case (it never throws).
    if (this.doc.contents == null) {
      this.doc.contents = this.doc.createNode({}) as any;
    }
    const root: any = this.doc.contents;
    if (!isMap(root)) return; // sequence or scalar root: no-op (never throws)

    // Walk intermediate segments, creating the collection the *next* segment needs: a sequence
    // when it is a numeric index, a map otherwise. A scalar (or missing) intermediate is replaced
    // with that collection — the same behavior a deep-set utility like lodash's `set` has for a
    // superseded scalar. An intermediate that is already a *collection* of the wrong shape — e.g. a
    // sequence where a key is about to be written — is the user's own structure: setIn bails instead
    // of walking into it, which would otherwise throw out of setIn (`YAMLSeq.set('api', …)` →
    // "Expected a valid index, not api."), and a throw here reaches React's render phase and
    // unmounts the whole app.
    let node: any = root;
    unflowIfEmpty(node);
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      const wantSeq = typeof path[i + 1] === 'number';
      let next = node.get(seg, true);
      // A scalar (or a missing) intermediate is superseded — lodash `set` semantics, and at most one
      // value is lost. An intermediate that is already a *collection* of the wrong shape is the
      // user's own structure: bail instead of overwriting it. setIn then changes nothing, the
      // reducer sees `text === s.text` and reports EDIT_FAILED (Task 3) — visible, and non-destructive.
      if (isMap(next) || isSeq(next)) { if (wantSeq ? !isSeq(next) : !isMap(next)) return; }
      else { next = this.doc.createNode(wantSeq ? [] : {}); node.set(seg, next); }
      node = next;
      unflowIfEmpty(node);
    }
    // The loop guarantees `node` matches the last segment's type, so this set never throws.
    node.set(path[path.length - 1], value);
  }

  deleteIn(path: ValuesPath): void {
    if (path.length === 0) return;
    let node: any = this.doc.contents;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      // Bail — matching setIn's own bail semantics — when the segment's type doesn't match the
      // node it is about to index into: a string key against a YAMLSeq, or a numeric index against
      // a YAMLMap. Without this check `YAMLSeq.get('0', true)` (and `.delete('0')`) coerce a
      // numeric-*string* segment to an index via `asItemIndex` — so a path built from a map-shaped
      // intent (e.g. a name that happens to look numeric) could silently walk into — or delete from
      // — a sequence by position instead of being the no-op the caller expects.
      if (isSeq(node)) { if (typeof seg !== 'number') return; }
      else if (isMap(node)) { if (typeof seg === 'number') return; }
      else return; // missing/scalar intermediate: no-op
      node = node.get(seg, true);
    }
    const last = path[path.length - 1];
    if (isSeq(node)) { if (typeof last !== 'number') return; }
    else if (isMap(node)) { if (typeof last === 'number') return; }
    else return; // missing/scalar target parent: no-op
    node.delete(last);
    // Removing the last entry of a top-level entity map would leave `deployments: {}` behind:
    // noise in the file, and the flow-`{}` parent the un-flow above then has to repair. Prune the
    // key instead — unless it carries a comment, which would be dropped with it.
    // Note: a delete-then-set batch that targets the same top-level key relocates that key to the
    // end of the file (the prune removes the pair, then setIn re-appends it) — latent, no caller
    // does this today.
    if (path.length !== 2 || !isMap(node) || node.items.length > 0) return;
    const top: any = this.doc.contents;
    if (!isMap(top)) return;
    // Look up by identity of the emptied node, not by re-deriving the key: a `String(key.value)`
    // match can pick a different pair than the one `top.delete` (strict key equality) would act on
    // when two keys stringify the same (e.g. `true` vs `'true'`).
    const pair: any = top.items.find((it: any) => it.value === node);
    if (!pair) return;
    // An anchor on the key or value means an alias elsewhere still needs it; dropping the pair would
    // leave that alias unresolved and make `toString()` throw.
    if (pair.key?.anchor || pair.value?.anchor) return;
    const annotated = !!(pair.key?.commentBefore || pair.key?.comment || pair.value?.commentBefore || pair.value?.comment);
    if (!annotated) top.delete(path[0]);
  }

  toString(): string {
    // A document with parse errors cannot be stringified by `yaml` (it
    // throws), so fall back to the original source verbatim. Likewise an
    // untouched empty/whitespace/comment-only document has null `contents`,
    // which `yaml` would otherwise render as the literal text "null\n" —
    // return the original source instead.
    if (this.errors.length || this.doc.contents == null) return this.source;
    try {
      // lineWidth 0 disables folding; flowCollectionPadding false keeps `{a: b}` from becoming
      // `{ a: b }` on every round-trip, which would make the "minimal" diff span the whole file.
      return this.doc.toString({ lineWidth: 0, flowCollectionPadding: false });
    } catch {
      // `yaml` throws stringifying rather than emitting invalid YAML when an edit leaves an alias
      // unresolved — e.g. deleting an anchored child (`web: &w {}`) whose alias (`*w`) lives
      // elsewhere. toString() must never throw (same contract as the two fallbacks above: a throw
      // here reaches React's render phase and unmounts the whole app), so fall back to the source
      // this document was parsed from. The reducer then sees `text === s.text` and reports the edit
      // as the no-op it effectively is (EDIT_FAILED when a focus was requested).
      return this.source;
    }
  }

  clone(): ValuesDocument { return ValuesDocument.parse(this.toString()); }

  /** Clone, apply ops in order, return the new document. `this` is never mutated. Invalid documents pass through unchanged. */
  apply(ops: EditOp[]): ValuesDocument {
    if (this.errors.length) return this.clone();
    const next = this.clone();
    for (const o of ops) {
      if (o.op === 'set') next.setIn(o.path, o.value);
      else next.deleteIn(o.path);
    }
    return next;
  }

  /** Plain-JS value at path (undefined when absent). `[]` returns the whole document as JS. */
  valueAt(path: ValuesPath): unknown {
    let cur: any = this.toJS();
    for (const seg of path) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = cur[seg as any];
    }
    return cur;
  }

  /** 1-based line of the key node at path, or null. */
  lineOf(path: ValuesPath): number | null {
    let node: any = this.doc.contents;
    let keyNode: any = null;
    for (const seg of path) {
      if (isMap(node)) {
        const pair = node.items.find((p: any) => isPair(p) && String((p.key as any)?.value ?? p.key) === String(seg));
        if (!pair) return null;
        keyNode = pair.key; node = pair.value;
      } else if (isSeq(node) && typeof seg === 'number') {
        node = node.items[seg]; keyNode = node;
        if (!node) return null;
      } else return null;
    }
    const range = keyNode?.range;
    if (!range) return null;
    return this.lc.linePos(range[0]).line;
  }

  /** 1-based inclusive line span from the key at `path` to the end of its value, or null when absent. */
  rangeOf(path: ValuesPath): { start: number; end: number } | null {
    if (path.length === 0) return null;
    let node: any = this.doc.contents;
    let keyNode: any = null;
    for (const seg of path) {
      if (isMap(node)) {
        const pair = node.items.find((p: any) => isPair(p) && String((p.key as any)?.value ?? p.key) === String(seg));
        if (!pair) return null;
        keyNode = pair.key; node = pair.value;
      } else if (isSeq(node) && typeof seg === 'number') {
        node = node.items[seg]; keyNode = node;
        if (!node) return null;
      } else return null;
    }
    const startPos = keyNode?.range?.[0];
    if (typeof startPos !== 'number') return null;
    // yaml Node.range = [start, valueEnd, nodeEnd]; valueEnd excludes trailing whitespace/comments.
    const endPos: number | undefined = node?.range?.[1] ?? keyNode?.range?.[1];
    const start = this.lc.linePos(startPos).line;
    const end = typeof endPos === 'number' ? this.lc.linePos(Math.max(startPos, endPos - 1)).line : start;
    return { start, end: Math.max(start, end) };
  }
}
