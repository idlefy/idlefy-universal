import { describe, it, expect } from 'vitest';
import { ValuesDocument } from '../src/model/ValuesDocument';

const src = `# top comment
deployments:
  api:            # the api
    replicas: 2
    containers:
      main: {image: nginx, imageTag: "1"}
`;

describe('ValuesDocument', () => {
  it('parses and exposes JS', () => {
    const d = ValuesDocument.parse(src);
    expect(d.errors).toEqual([]);
    expect(d.toJS().deployments.api.replicas).toBe(2);
  });
  it('setIn keeps comments', () => {
    const d = ValuesDocument.parse(src);
    d.setIn(['deployments', 'api', 'replicas'], 3);
    const out = d.toString();
    expect(out).toContain('# top comment');
    expect(out).toContain('# the api');
    expect(out).toContain('replicas: 3');
  });
  it('deleteIn removes the key rather than writing null', () => {
    const d = ValuesDocument.parse(src);
    d.deleteIn(['deployments', 'api', 'replicas']);
    expect(d.toString()).not.toContain('replicas');
  });
  it('setIn creates intermediate maps', () => {
    const d = ValuesDocument.parse('deployments: {}\n');
    d.setIn(['deployments', 'web', 'replicas'], 1);
    expect(d.toJS().deployments.web.replicas).toBe(1);
  });
  it('setIn creates a sequence when the next path segment is a numeric index', () => {
    const d = ValuesDocument.parse('');
    d.setIn(['args', 0], 'x');
    expect(d.toString()).toBe('args:\n  - x\n');
  });
  it('setIn creates a sequence of maps for a deep numeric-index path', () => {
    const d = ValuesDocument.parse('');
    d.setIn(['env', 0, 'name'], 'N');
    expect(d.toString()).toBe('env:\n  - name: N\n');
  });
  it('lineOf returns 1-based line of the key', () => {
    const d = ValuesDocument.parse(src);
    expect(d.lineOf(['deployments', 'api'])).toBe(3);
    expect(d.lineOf(['deployments', 'api', 'containers', 'main'])).toBe(6);
    expect(d.lineOf(['nope'])).toBeNull();
  });
  it('reports syntax errors with position and yields {} JS', () => {
    const d = ValuesDocument.parse('deployments:\n  api: [\n');
    expect(d.errors.length).toBeGreaterThan(0);
    expect(d.errors[0].line).toBeGreaterThan(0);
    expect(d.toJS()).toEqual({});
  });
  it('toString() and clone() return the source verbatim for an invalid document', () => {
    const bad = 'deployments:\n  api: [\n';
    const d = ValuesDocument.parse(bad);
    expect(d.toString()).toBe(bad);
    const c = d.clone();
    expect(c.errors.length).toBeGreaterThan(0);
    expect(c.toString()).toBe(bad);
  });
  it('parse("") yields {} JS and stringifies back to ""', () => {
    const d = ValuesDocument.parse('');
    expect(d.errors).toEqual([]);
    expect(d.toJS()).toEqual({});
    expect(d.toString()).toBe('');
  });
  it('clone() is independent of the original', () => {
    const d = ValuesDocument.parse('a: 1\n');
    const c = d.clone();
    c.setIn(['a'], 2);
    expect(d.toJS().a).toBe(1);
    expect(c.toJS().a).toBe(2);
  });
  it('setIn on a scalar intermediate replaces it with a map instead of throwing', () => {
    const d = ValuesDocument.parse('a: 5\n');
    expect(() => d.setIn(['a', 'b'], 1)).not.toThrow();
    expect(d.toJS()).toEqual({ a: { b: 1 } });
  });
  it('setIn is a no-op when the document root is a sequence', () => {
    const d = ValuesDocument.parse('- 1\n- 2\n');
    expect(() => d.setIn(['a'], 1)).not.toThrow();
    expect(d.toJS()).toEqual([1, 2]);
  });
  it('setIn is a no-op when the document root is a scalar', () => {
    const d = ValuesDocument.parse('5\n');
    expect(() => d.setIn(['a'], 1)).not.toThrow();
    expect(d.toString()).toBe('5\n');
  });
  it('deleteIn on an empty document is a no-op', () => {
    const d = ValuesDocument.parse('');
    expect(() => d.deleteIn(['a'])).not.toThrow();
  });
  it('deleteIn with a missing intermediate is a no-op', () => {
    const d = ValuesDocument.parse('x: 1\n');
    expect(() => d.deleteIn(['missing', 'b'])).not.toThrow();
    expect(d.toJS()).toEqual({ x: 1 });
  });
  it('deleteIn with a scalar intermediate is a no-op', () => {
    const d = ValuesDocument.parse('a: 5\n');
    expect(() => d.deleteIn(['a', 'b'])).not.toThrow();
    expect(d.toJS()).toEqual({ a: 5 });
  });
  it('apply() returns a new document with set/delete ops and leaves the original untouched', () => {
    const d = ValuesDocument.parse('a:\n  b: 1   # keep\n  c: 2\n');
    const e = d.apply([{ op: 'set', path: ['a', 'b'], value: 5 }, { op: 'delete', path: ['a', 'c'] }, { op: 'set', path: ['a', 'd', 'e'], value: true }]);
    expect(e.toString()).toBe('a:\n  b: 5 # keep\n  d:\n    e: true\n'); // yaml 2.9 collapses the pre-comment gutter to one space
    // d itself was never mutated, but toString() always re-serialises through yaml (never caches
    // the original source for a valid document), which collapses the gutter the same way here too.
    expect(d.toString()).toBe('a:\n  b: 1 # keep\n  c: 2\n');
  });
  it('apply() on an invalid document returns an equal document without throwing', () => {
    const d = ValuesDocument.parse('a: [\n');
    const e = d.apply([{ op: 'set', path: ['a'], value: 1 }]);
    expect(e.toString()).toBe('a: [\n');
    expect(e.errors.length).toBeGreaterThan(0);
  });
  it('valueAt() reads nested values from the parsed document', () => {
    const d = ValuesDocument.parse('deployments:\n  web:\n    replicas: 2\n    containers: {main: {image: nginx}}\n');
    expect(d.valueAt(['deployments', 'web', 'replicas'])).toBe(2);
    expect(d.valueAt(['deployments', 'web', 'containers', 'main'])).toEqual({ image: 'nginx' });
    expect(d.valueAt(['deployments', 'nope'])).toBeUndefined();
    expect(d.valueAt([])).toEqual({ deployments: { web: { replicas: 2, containers: { main: { image: 'nginx' } } } } });
  });
  it('toString() does not re-wrap long scalars', () => {
    const long = 'word '.repeat(30).trim(); // 149 chars with spaces: foldable unless lineWidth is 0
    const d = ValuesDocument.parse(`a: ${long}\n`);
    expect(d.apply([{ op: 'set', path: ['b'], value: 1 }]).toString()).toBe(`a: ${long}\nb: 1\n`);
  });
  it('re-serialising an untouched subtree is byte-identical (minimal-diff precondition)', () => {
    const src = 'a:\n  r: {cpu: 10m, memory: 32Mi}\n  n: 1\n';
    expect(ValuesDocument.parse(src).apply([{ op: 'set', path: ['a', 'n'], value: 2 }]).toString())
      .toBe('a:\n  r: {cpu: 10m, memory: 32Mi}\n  n: 2\n');
  });
  it('rangeOf gives the 1-based line span of a block, null when absent', () => {
    const d = ValuesDocument.parse(src);
    expect(d.rangeOf(['deployments', 'api'])).toEqual({ start: 3, end: 6 });
    expect(d.rangeOf(['deployments', 'api', 'replicas'])).toEqual({ start: 4, end: 4 });
    expect(d.rangeOf(['deployments'])).toEqual({ start: 2, end: 6 });
    expect(d.rangeOf(['nope'])).toBeNull();
    expect(d.rangeOf([])).toBeNull();
  });
  it('deleteIn on a sequence index splices the item and keeps flow style', () => {
    const d = ValuesDocument.parse('args: [a, b, c]\n');
    const e = d.apply([{ op: 'delete', path: ['args', 1] }]);
    expect(e.toJS()).toEqual({ args: ['a', 'c'] });
    expect(e.toString()).toBe('args: [a, c]\n');
  });
  it('setIn on the next sequence index appends and keeps flow style', () => {
    const d = ValuesDocument.parse('args: [x, y]\n');
    const e = d.apply([{ op: 'set', path: ['args', 2], value: 'z' }]);
    expect(e.toJS()).toEqual({ args: ['x', 'y', 'z'] });
    expect(e.toString()).toBe('args: [x, y, z]\n');
  });
  it('setIn on a leaf inside a block sequence of maps preserves a comment on the sequence', () => {
    const d = ValuesDocument.parse('env: # vars\n  - name: A\n    value: "1"\n  - name: B\n    value: "2"\n');
    const e = d.apply([{ op: 'set', path: ['env', 0, 'value'], value: 'v' }]);
    expect(e.toJS()).toEqual({ env: [{ name: 'A', value: 'v' }, { name: 'B', value: '2' }] });
    expect(e.toString()).toContain('# vars');
    expect(e.toString()).toContain('value: "v"');
  });
});
