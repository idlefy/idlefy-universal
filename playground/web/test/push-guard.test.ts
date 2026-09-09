import { describe, it, expect } from 'vitest';
import { externalEdit } from '../src/editor/pushGuard';

describe('externalEdit', () => {
  it('skips a value that merely echoes the last emission', () => {
    expect(externalEdit('a: 1\n', 'a: 1\n', 'a: 1\n')).toBeNull();
  });
  it('skips a value the model already holds', () => {
    expect(externalEdit('a: 1\n', null, 'a: 1\n')).toBeNull();
  });
  it('returns the minimal edit for a genuinely new value', () => {
    expect(externalEdit('a: 1\n', 'a: 1\n', 'a: 2\n')).toEqual({ start: 3, end: 4, text: '2' });
  });
  // Documented limitation: the guard only remembers the *latest* emission, so an echo of an older
  // one is indistinguishable from a fresh external value and is applied. Harmless while onChange is
  // synchronous and undebounced (no older value can still be in flight); asserted so a future
  // debounce breaks this test rather than silently reverting typed characters.
  it('does NOT skip a stale echo of an older emission', () => {
    expect(externalEdit('C', 'C', 'B')).toEqual({ start: 0, end: 1, text: 'B' });
  });
});
