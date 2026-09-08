import type { ValuesPath } from '../model/ValuesDocument';

/** Same values path, segment by segment (`undefined` never matches). */
export const sameP = (a: ValuesPath | undefined, b: ValuesPath): boolean => !!a && a.length === b.length && a.every((x, i) => x === b[i]);
