import { Document, parseDocument, isMap, isSeq, isPair, LineCounter } from 'yaml';

export type ValuesPath = (string | number)[];

export class ValuesDocument {
  private doc: Document;
  private lc: LineCounter;
  readonly errors: { message: string; line: number; col: number }[];

  private constructor(doc: Document, lc: LineCounter, errors: { message: string; line: number; col: number }[]) {
    this.doc = doc;
    this.lc = lc;
    this.errors = errors;
  }

  static parse(text: string): ValuesDocument {
    const lc = new LineCounter();
    const doc = parseDocument(text, { lineCounter: lc, keepSourceTokens: true });
    const errors = doc.errors.map((e) => {
      const pos = e.pos?.[0] ?? 0;
      const { line, col } = lc.linePos(pos);
      return { message: e.message, line, col };
    });
    return new ValuesDocument(doc, lc, errors);
  }

  toJS(): any {
    if (this.errors.length) return {};
    const js = this.doc.toJS();
    return js && typeof js === 'object' ? js : {};
  }
  hasIn(path: ValuesPath): boolean { return this.doc.hasIn(path); }
  getIn(path: ValuesPath): unknown { return this.doc.getIn(path); }
  setIn(path: ValuesPath, value: unknown): void {
    if (!isMap(this.doc.contents)) this.doc.contents = this.doc.createNode({}) as any;
    this.doc.setIn(path, value);
  }
  deleteIn(path: ValuesPath): void {
    if (!isMap(this.doc.contents) && !isSeq(this.doc.contents)) return;
    this.doc.deleteIn(path);
  }
  toString(): string { return this.doc.toString(); }
  clone(): ValuesDocument { return ValuesDocument.parse(this.toString()); }

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
}
