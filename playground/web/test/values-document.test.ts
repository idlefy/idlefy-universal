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
    expect(d.hasIn(['deployments', 'api', 'replicas'])).toBe(false);
  });
  it('setIn creates intermediate maps', () => {
    const d = ValuesDocument.parse('deployments: {}\n');
    d.setIn(['deployments', 'web', 'replicas'], 1);
    expect(d.toJS().deployments.web.replicas).toBe(1);
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
    expect(d.hasIn(['a'])).toBe(false);
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
});
