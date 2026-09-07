/**
 * Smallest single-range replacement turning `oldText` into `newText`: strip the common prefix and
 * suffix, replace what is left. Offsets are UTF-16 code units (what Monaco's getPositionAt takes).
 * Returns null when the texts are identical.
 */
export function minimalEdit(oldText: string, newText: string): { start: number; end: number; text: string } | null {
  if (oldText === newText) return null;
  let start = 0;
  const max = Math.min(oldText.length, newText.length);
  while (start < max && oldText.charCodeAt(start) === newText.charCodeAt(start)) start++;
  let endOld = oldText.length, endNew = newText.length;
  while (endOld > start && endNew > start && oldText.charCodeAt(endOld - 1) === newText.charCodeAt(endNew - 1)) { endOld--; endNew--; }
  return { start, end: endOld, text: newText.slice(start, endNew) };
}
