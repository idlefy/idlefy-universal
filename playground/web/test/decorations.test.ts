import { describe, it, expect } from 'vitest';
import { blockDecorations } from '../src/editor/decorations';

describe('blockDecorations', () => {
  it('is empty without a range', () => { expect(blockDecorations(null)).toEqual([]); });
  it('marks the whole block and the head line', () => {
    const d = blockDecorations({ start: 6, end: 43 });
    expect(d).toHaveLength(2);
    expect(d[0].range).toEqual({ startLineNumber: 6, startColumn: 1, endLineNumber: 43, endColumn: 1 });
    expect(d[0].options).toEqual({ isWholeLine: true, className: 'sel-block', linesDecorationsClassName: 'sel-bar' });
    expect(d[1].range.startLineNumber).toBe(6);
    expect(d[1].range.endLineNumber).toBe(6);
    expect(d[1].options.className).toBe('sel-head');
  });
});
