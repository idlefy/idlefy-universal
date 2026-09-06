import { describe, it, expect } from 'vitest';
import { splitManifests } from '../src/engine/split';

describe('splitManifests', () => {
  it('drops empty documents and numbers the rest', () => {
    const text = `\n---\n\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: a\n---\n# only a comment\n---\nkind: ConfigMap\napiVersion: v1\nmetadata:\n  name: b\n`;
    const m = splitManifests('c/templates/x.yaml', text);
    expect(m.map((x) => [x.docIndex, x.obj.kind, x.obj.metadata.name])).toEqual([[0, 'Service', 'a'], [1, 'ConfigMap', 'b']]);
    expect(m[0].raw).toContain('kind: Service');
    expect(m[0].templatePath).toBe('c/templates/x.yaml');
  });
  it('ignores documents without kind', () => {
    expect(splitManifests('t', 'foo: bar\n')).toEqual([]);
  });
  it('throws with the template path when a document is malformed', () => {
    expect(() => splitManifests('c/templates/x.yaml', 'kind: Service\nmetadata:\n\tname: a\n')).toThrow(
      /^c\/templates\/x\.yaml: Tabs are not allowed as indentation/,
    );
  });
});
