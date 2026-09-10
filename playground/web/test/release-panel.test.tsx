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

const referencedTwoVarsYaml = `
secretRefs:
  db:
    - name: DB_URL
      secretKeyRef:
        name: db-secret
        key: url
    - name: DB_PASSWORD
      secretKeyRef:
        name: db-secret
        key: password
deployments:
  web:
    containers:
      main:
        image: nginx
        imageTag: "1.27"
        secretRefs: [db]
`;

const subdomainYaml = `
generic:
  ingressesGeneral:
    domain: example.com
deployments:
  web:
    containers:
      main:
        image: nginx
        imageTag: "1.27"
    ingress:
      hosts:
        - subdomain: api
          paths:
            - path: /
              pathType: Prefix
`;

const noSubdomainYaml = `
generic:
  ingressesGeneral:
    domain: example.com
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
    // and so is the object-list row × *inside* the card — the third path to the same silent drop.
    // It is disabled here because it is also the *only* variable in the group: removing it would take
    // the whole `db` key with it, same as the card's own ×.
    const dbRow = screen.getByLabelText('remove secretRefs.db.0') as HTMLButtonElement;
    expect(dbRow.disabled).toBe(true);
    expect(dbRow.title).toBe(`used by ${users.join(', ')} — remove that reference first`);
  });
  it('is enabled once nothing references any group, and still deletes the whole map', () => {
    const p = base(unreferencedYaml);
    render(<ReleasePanel {...p} />);
    const clear = screen.getByLabelText('clear secretRefs') as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    fireEvent.click(clear);
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: ['secretRefs'] }]);
  });
  it('a referenced group with more than one variable only locks the last row, not every row', () => {
    const p = base(referencedTwoVarsYaml);
    render(<ReleasePanel {...p} />);
    // the card × still guards the whole group
    expect((screen.getByLabelText('remove secretRefs.db') as HTMLButtonElement).disabled).toBe(true);
    // but removing row 0 leaves `db` (and the reference) standing, so it stays enabled
    const row0 = screen.getByLabelText('remove secretRefs.db.0') as HTMLButtonElement;
    expect(row0.disabled).toBe(false);
    fireEvent.click(row0);
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: ['secretRefs', 'db', 0] }]);
  });
});

describe('ReleasePanel — the generic.ingressesGeneral lock', () => {
  it('hides the block\'s own clear × while a subdomain is in use, and keeps domain editable', () => {
    const p = base(subdomainYaml);
    render(<ReleasePanel {...p} />);
    expect(screen.queryByLabelText('clear generic.ingressesGeneral')).toBeNull();
    const domain = screen.getByLabelText('generic.ingressesGeneral.domain') as HTMLInputElement;
    expect(domain.tagName).toBe('INPUT');
    expect(domain.type).toBe('text');
    expect(domain.value).toBe('example.com');
  });
  it('shows the block\'s clear × once nothing uses a subdomain', () => {
    const p = base(noSubdomainYaml);
    render(<ReleasePanel {...p} />);
    const clear = screen.getByLabelText('clear generic.ingressesGeneral') as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    fireEvent.click(clear);
    expect(p.onEdit).toHaveBeenLastCalledWith([{ op: 'delete', path: ['generic', 'ingressesGeneral'] }]);
  });
});
