import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
    expect(svcs.every((n) => n.warnings.some((w) => w.includes('Service/api')))).toBe(true);
  });
  it('hook badge only on the migrations job, never on ConfigMaps (which also carry helm.sh/hook)', () => {
    const { manifests, values } = loadFixture('full-features');
    expect(buildGraph(manifests, values, 'default').nodes.filter((n) => n.hookBadge)).toEqual([]);
    const text = 'apiVersion: batch/v1\nkind: Job\nmetadata:\n  name: api-migrations\n  annotations: {"helm.sh/hook": pre-install}\nspec:\n  template:\n    metadata: {labels: {}}\n    spec: {containers: []}\n';
    const g = buildGraph(splitManifests('c/templates/job.yaml', text), { deployments: { api: { migrations: { enabled: true } } } }, 'default');
    expect(g.nodes.filter((n) => n.hookBadge).map((n) => n.name)).toEqual(['api-migrations']);
  });
  it('never badges a non-Job whose values path merely ends in "migrations"', () => {
    const cm = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: migrations\ndata: {}\n';
    const g = buildGraph(splitManifests('c/templates/configs.yaml', cm), { configs: { migrations: { type: 'configmap', data: {} } } }, 'default');
    const node = g.nodes.find((n) => n.kind === 'ConfigMap')!;
    expect(node.provenance?.path).toEqual(['configs', 'migrations']);
    expect(node.hookBadge).toBe(false);
  });
  it('the Secret produced by a Certificate is not external', () => {
    const { manifests, values } = loadFixture('full-features');
    const g = buildGraph(manifests, values, 'default');
    const tls = g.nodes.find((n) => n.kind === 'Secret' && n.name === 'api-tls')!;
    expect(tls.external).toBe(false);
    expect(tls.manifest).toBeUndefined();
    expect(tls.provenance).toBeUndefined();
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
  it('warns about an expectation that no manifest consumed', () => {
    const g = buildGraph([], { services: { foo: { ports: [{ port: 80 }] } } }, 'default');
    expect(g.warnings).toEqual(['Service/foo: expected from values path services.foo but not rendered']);
  });
  const fixtureNames = fs.readdirSync(path.resolve(__dirname, '..', 'src', 'graph', '__fixtures__'))
    .filter((f) => f.endsWith('.yaml') && !f.endsWith('.values.yaml')).map((f) => f.replace(/\.yaml$/, ''));
  it.each(fixtureNames)('%s: node ids and edge ids are unique and every edge resolves', (name) => {
    const { manifests, values } = loadFixture(name);
    const g = buildGraph(manifests, values, 'default');
    const ids = g.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const edgeIds = g.edges.map((e) => e.id);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
    const nodeIds = new Set(ids);
    for (const e of g.edges) { expect(nodeIds.has(e.source)).toBe(true); expect(nodeIds.has(e.target)).toBe(true); }
  });
  it('stateful-storage: full provenance, hook badge on the migrations Job, no external nodes', () => {
    const { manifests, values } = loadFixture('stateful-storage');
    const g = buildGraph(manifests, values, 'default');
    const rendered = g.nodes.filter((n) => n.manifest);
    expect(rendered.length).toBe(manifests.length);
    expect(rendered.every((n) => n.provenance)).toBe(true);
    expect(g.nodes.filter((n) => n.external)).toEqual([]);
    const job = g.nodes.find((n) => n.kind === 'Job')!;
    expect(job.hookBadge).toBe(true);
    expect(job.provenance?.owner).toEqual(['deployments', 'web']);
    expect(g.nodes.find((n) => n.kind === 'Secret')?.provenance?.path).toEqual(['configs', 'app-secrets']);
    expect(g.nodes.find((n) => n.kind === 'PersistentVolumeClaim')?.provenance?.path).toEqual(['persistentVolumeClaims', 'uploads']);
  });
  it('warns on an auto-created Ingress whose backend Service is not part of the release', () => {
    const dep = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  template:\n    metadata:\n      labels: {app.kubernetes.io/name: web}\n    spec:\n      containers:\n        - name: main\n          image: nginx\n';
    const ing = 'apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: web\nspec:\n  rules:\n    - host: web.example.com\n      http:\n        paths:\n          - path: /\n            pathType: Prefix\n            backend: {service: {name: web, port: {number: 80}}}\n';
    const values = { deployments: { web: { autoCreateService: false, autoCreateIngress: true, containers: { main: { image: 'nginx', imageTag: '1' } }, ingress: { hosts: [{ host: 'web.example.com' }] } } } };
    const g = buildGraph([...splitManifests('c/templates/deployment.yaml', dep), ...splitManifests('c/templates/ingress.yaml', ing)], values, 'default');
    const node = g.nodes.find((n) => n.kind === 'Ingress')!;
    expect(node.provenance?.owner).toEqual(['deployments', 'web']);
    expect(node.warnings.some((w) => w.includes('no Service in this release backs it'))).toBe(true);
    expect(g.warnings).toEqual([]);   // node-level only: no permanent banner
  });
  it('does not warn when the backend Service is rendered, nor on standalone entries', () => {
    const { manifests, values } = loadFixture('example-01-hello-world');
    const g = buildGraph(manifests, values, 'default');
    expect(g.nodes.flatMap((n) => n.warnings)).toEqual([]);
    const gw = loadFixture('example-05-gateway-api');
    const g5 = buildGraph(gw.manifests, gw.values, 'default');
    // example 05's HTTPRoute is standalone (no owner) and its backendRef is a placeholder — no warning.
    expect(g5.nodes.find((n) => n.kind === 'HTTPRoute')!.warnings).toEqual([]);
  });
});
