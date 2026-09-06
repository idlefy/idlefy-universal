import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/graph/build';
import { loadFixture } from './fixtures';
import { splitManifests } from '../src/engine/split';

describe('buildGraph', () => {
  it('always includes the release root', () => {
    const g = buildGraph([], {}, 'default');
    expect(g.nodes.map((n) => n.id)).toEqual(['release']);
    expect(g.nodes[0].provenance?.path).toEqual([]);
  });
  it('full-features: every rendered manifest is a node with provenance, edges resolve', () => {
    const { manifests, values } = loadFixture('full-features');
    const g = buildGraph(manifests, values, 'default');
    const rendered = g.nodes.filter((n) => n.manifest);
    expect(rendered.length).toBe(manifests.length);
    expect(rendered.every((n) => n.provenance)).toBe(true);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) { expect(ids.has(e.source)).toBe(true); expect(ids.has(e.target)).toBe(true); }
    expect(g.nodes.some((n) => n.external && n.kind === 'ClusterIssuer')).toBe(true);
  });
  it('marks a Secret referenced but not rendered as external', () => {
    const dep = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: a\nspec:\n  template:\n    metadata:\n      labels: {app.kubernetes.io/name: a}\n    spec:\n      containers:\n        - name: m\n          envFrom: [{secretRef: {name: ext}}]\n';
    const g = buildGraph(splitManifests('c/templates/deployment.yaml', dep), { deployments: { a: {} } }, 'default');
    const ext = g.nodes.find((n) => n.kind === 'Secret')!;
    expect(ext.external).toBe(true);
    expect(g.edges.find((e) => e.target === ext.id)?.relation).toBe('reads');
  });
  it('keeps both nodes on a name collision and flags them', () => {
    const two = 'apiVersion: v1\nkind: Service\nmetadata:\n  name: api\nspec: {selector: {x: y}}\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: api\nspec: {selector: {x: y}}\n';
    const g = buildGraph(splitManifests('c/templates/service.yaml', two), { services: { api: {} }, deployments: { api: { autoCreateService: true, containers: { m: { image: 'x', imageTag: '1', ports: { h: { containerPort: 1 } } } } } } }, 'default');
    const svcs = g.nodes.filter((n) => n.kind === 'Service');
    expect(svcs.map((n) => n.id)).toEqual(['default/Service/api', 'default/Service/api#2']);
    expect(svcs.every((n) => n.conflict)).toBe(true);
    expect(g.warnings.some((w) => w.includes('Service/api'))).toBe(true);
  });
  it('hook badge only on the migrations job, never on ConfigMaps (which also carry helm.sh/hook)', () => {
    const { manifests, values } = loadFixture('full-features');
    expect(buildGraph(manifests, values, 'default').nodes.filter((n) => n.hookBadge)).toEqual([]);
    const text = 'apiVersion: batch/v1\nkind: Job\nmetadata:\n  name: api-migrations\n  annotations: {"helm.sh/hook": pre-install}\nspec:\n  template:\n    metadata: {labels: {}}\n    spec: {containers: []}\n';
    const g = buildGraph(splitManifests('c/templates/job.yaml', text), { deployments: { api: { migrations: { enabled: true } } } }, 'default');
    expect(g.nodes.filter((n) => n.hookBadge).map((n) => n.name)).toEqual(['api-migrations']);
  });
  it('the Secret produced by a Certificate is not external', () => {
    const { manifests, values } = loadFixture('full-features');
    const g = buildGraph(manifests, values, 'default');
    const tls = g.nodes.find((n) => n.kind === 'Secret' && n.name === 'api-tls')!;
    expect(tls.external).toBe(false);
    expect(g.edges.filter((e) => e.target === tls.id).map((e) => e.relation).sort()).toEqual(['produces', 'tls-from']);
  });
  it('a Job RoleBinding subject without a ServiceAccount manifest is external', () => {
    const { manifests, values } = loadFixture('full-features');
    const g = buildGraph(manifests, values, 'default');
    const rb = g.nodes.find((n) => n.kind === 'RoleBinding')!;
    // full-features has autoCreateRbac on deployments.api (which has an SA); assert the generic rule instead:
    const jobRb = 'apiVersion: rbac.authorization.k8s.io/v1\nkind: RoleBinding\nmetadata:\n  name: init\nroleRef: {kind: Role, name: init}\nsubjects: [{kind: ServiceAccount, name: init, namespace: default}]\n';
    const g2 = buildGraph(splitManifests('c/templates/rbac.yaml', jobRb), { jobs: { init: { autoCreateRbac: true } } }, 'default');
    const sa = g2.nodes.find((n) => n.kind === 'ServiceAccount')!;
    expect(sa.external).toBe(true);
    expect(rb).toBeTruthy();
  });
});
