import { describe, it, expect } from 'vitest';
import { minimalEdit } from '../src/model/textDiff';

const applyEdit = (s: string, e: { start: number; end: number; text: string }) => s.slice(0, e.start) + e.text + s.slice(e.end);

describe('minimalEdit', () => {
  it('returns null when texts are equal', () => {
    expect(minimalEdit('a: 1\n', 'a: 1\n')).toBeNull();
  });
  it('replaces only the changed middle', () => {
    const a = 'x: 1\ny: 2\nz: 3\n', b = 'x: 1\ny: 20\nz: 3\n';
    const e = minimalEdit(a, b)!;
    expect(e).toEqual({ start: 9, end: 9, text: '0' });
    expect(applyEdit(a, e)).toBe(b);
  });
  it('handles insertion at the end and deletion in the middle', () => {
    expect(applyEdit('a: 1\n', minimalEdit('a: 1\n', 'a: 1\nb: 2\n')!)).toBe('a: 1\nb: 2\n');
    expect(applyEdit('a: 1\nb: 2\nc: 3\n', minimalEdit('a: 1\nb: 2\nc: 3\n', 'a: 1\nc: 3\n')!)).toBe('a: 1\nc: 3\n');
  });
  it('never lets prefix and suffix overlap', () => {
    // "aa" -> "aaa": prefix 2 and suffix 2 would overlap; the edit must still be a pure insertion.
    const e = minimalEdit('aa', 'aaa')!;
    expect(e.end).toBeGreaterThanOrEqual(e.start);
    expect(applyEdit('aa', e)).toBe('aaa');
  });
});
