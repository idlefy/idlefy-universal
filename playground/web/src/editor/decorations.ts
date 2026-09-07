export type LineRange = { start: number; end: number };
type Deco = { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; options: { isWholeLine: true; className: string; linesDecorationsClassName?: string } };

/** Monaco delta decorations for the values block of the selected node: a tint + gutter bar over the
 *  whole block, a stronger tint on its first line. Pure so it can be unit-tested without Monaco. */
export function blockDecorations(r: LineRange | null): Deco[] {
  if (!r) return [];
  const line = (n: number) => ({ startLineNumber: n, startColumn: 1, endLineNumber: n, endColumn: 1 });
  return [
    { range: { startLineNumber: r.start, startColumn: 1, endLineNumber: r.end, endColumn: 1 }, options: { isWholeLine: true, className: 'sel-block', linesDecorationsClassName: 'sel-bar' } },
    { range: line(r.start), options: { isWholeLine: true, className: 'sel-head' } },
  ];
}
