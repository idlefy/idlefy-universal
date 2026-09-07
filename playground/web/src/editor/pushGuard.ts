import { minimalEdit } from '../model/textDiff';

/**
 * Whether an incoming `value` prop is a genuine external replacement (examples picker, inspector
 * edit) that the Monaco model should be pushed, or just an echo the model already holds.
 *
 * Returns the minimal single-range edit turning `modelText` into `value`, or null when nothing has
 * to be pushed: `value` merely echoes the last text this component saw/emitted, or the model already
 * equals it.
 *
 * `lastEmitted` must be refreshed to the value written after every successful push, otherwise a
 * later prop equal to that stale text is dropped and the model keeps showing something else.
 * Only the latest emission is remembered, so an echo of an *older* one is applied — harmless while
 * onChange is dispatched synchronously and undebounced (no older value can still be in flight).
 */
export function externalEdit(
  modelText: string, lastEmitted: string | null, value: string,
): { start: number; end: number; text: string } | null {
  if (value === lastEmitted) return null;
  return minimalEdit(modelText, value);
}
