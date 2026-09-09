import type { ValuesPath } from './ValuesDocument';

/** True for a non-null, non-array object. */
export const isObj = <T = Record<string, unknown>>(v: unknown): v is T =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** True for a non-null, non-array object with at least one key. */
export const isFilledObj = <T = Record<string, unknown>>(v: unknown): v is T =>
  isObj<Record<string, unknown>>(v) && Object.keys(v).length > 0;

/** True for a value that is not an object (i.e. a leaf: string, number, boolean, null, undefined). */
export const isScalar = (v: unknown): boolean => v === null || typeof v !== 'object';

/** Same values path, segment by segment (`undefined` never matches). */
export const samePath = (a: ValuesPath | undefined, b: ValuesPath | undefined): boolean =>
  !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
