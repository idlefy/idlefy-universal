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
});
