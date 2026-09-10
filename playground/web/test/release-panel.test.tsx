// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import schema from '../src/chart-bundle/schema.json';
import { ReleasePanel } from '../src/inspector/ReleasePanel';
import { ValuesDocument } from '../src/model/ValuesDocument';
import { secretRefUsers } from '../src/inspector/summary';

const root = schema as any;
afterEach(cleanup);

const base = (text: string) => ({
  target: { kind: 'release' as const }, root, doc: ValuesDocument.parse(text), tier: 'basic' as const,
  disabled: false, onEdit: vi.fn(), onTier: vi.fn(),
});

const referencedYaml = `
secretRefs:
  db:
    - name: DB_URL
      secretKeyRef:
        name: db-secret
        key: url
  api:
    - name: API_KEY
      secretKeyRef:
        name: api-secret
        key: key
deployments:
  web:
    containers:
      main:
        image: nginx
        imageTag: "1.27"
        secretRefs: [db]
`;

const unreferencedYaml = `
secretRefs:
  db:
    - name: DB_URL
      secretKeyRef:
        name: db-secret
        key: url
deployments:
  web:
    containers:
      main:
        image: nginx
        imageTag: "1.27"
`;

describe('ReleasePanel — the section-level secretRefs ×', () => {
  it('is disabled with the same real secretRefUsers title (em dash) a container still references', () => {
    const p = base(referencedYaml);
    render(<ReleasePanel {...p} />);
    const clear = screen.getByLabelText('clear secretRefs') as HTMLButtonElement;
    const all = p.doc.valueAt([]) as Record<string, unknown>;
    const users = secretRefUsers(all, 'db');
    expect(users).toEqual(['deployments/web · main']);
    expect(clear.disabled).toBe(true);
    expect(clear.title).toBe(`used by ${users.join(', ')} — remove that reference first`);
    expect(clear.title).toContain('—');   // em dash, not a hyphen
    fireEvent.click(clear);
    expect(p.onEdit).not.toHaveBeenCalled();
    // the per-card × for the referenced group is disabled the same way
    const dbCard = screen.getByLabelText('remove secretRefs.db') as HTMLButtonElement;
    expect(dbCard.disabled).toBe(true);
  });
  it('is enabled once nothing references any group, and still deletes the whole map', () => {
    const p = base(unreferencedYaml);
    render(<ReleasePanel {...p} />);
    const clear = screen.getByLabelText('clear secretRefs') as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    fireEvent.click(clear);
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: ['secretRefs'] }]);
  });
});
