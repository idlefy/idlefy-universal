import { describe, it, expect } from 'vitest';
import { extractRefs } from '../src/graph/edges';
import { loadFixture } from './fixtures';
import { buildExpectations } from '../src/graph/expectations';
import { attachProvenance } from '../src/graph/provenance';
import { familyOf, resourceKey } from '../src/graph/labels';
import { splitManifests } from '../src/engine/split';
import type { Manifest } from '../src/engine/types';
import type { GraphNode } from '../src/graph/types';

// Builds plain rendered nodes (no external nodes, no release node) — enough for extractRefs.
function nodesOf(manifests: Manifest[], values: any, ns = 'default'): GraphNode[] {
  const { byManifest } = attachProvenance(manifests, buildExpectations(values, ns), ns);
  return manifests.map((m) => {
    const nsOf = m.obj.metadata.namespace ?? ns;
    const key = resourceKey(nsOf, m.obj.kind, m.obj.metadata.name);
    return { id: key, key, kind: m.obj.kind, name: m.obj.metadata.name, namespace: nsOf, family: familyOf(m.obj.kind),
      external: false, conflict: false, hookBadge: false, manifest: m, provenance: byManifest.get(m), warnings: [] };
  });
}
function refsOf(fixture: string) {
  const { manifests, values } = loadFixture(fixture);
  return extractRefs(nodesOf(manifests, values));
}
const rel = (refs: any[], r: string) => refs.filter((x) => x.relation === r).map((x) => `${x.source.kind}/${x.source.name}->${x.targetKind}/${x.targetName}`);

describe('extractRefs', () => {
  // full-features (charts/idlefy-universal/ci/full-features-values.yaml): deployments.api with
  // service/ingress/certificate(letsencrypt-staging)/rbac/networkPolicy/pdb/serviceMonitor,
  // statefulSets.cache (serviceName cache-headless), daemonSets.node-info, jobs.init, cronJobs.beacon,
  // configs.app-config, hpas.cache. No migrations. Adjust names here (not in code) if the fixture changes.
  it('full-features covers the core relations', () => {
    const refs = refsOf('full-features');
    expect(rel(refs, 'selects').sort()).toEqual(['Service/api->Deployment/api', 'Service/cache-headless->StatefulSet/cache']);
    expect(rel(refs, 'routes-to')).toEqual(['Ingress/api->Service/api']);
    expect(rel(refs, 'tls-from')).toEqual(['Ingress/api->Secret/api-tls']);
    expect(rel(refs, 'scales')).toEqual(['HorizontalPodAutoscaler/cache->StatefulSet/cache']);
    expect(rel(refs, 'governed-by')).toEqual(['StatefulSet/cache->Service/cache-headless']);
    expect(rel(refs, 'protects')).toEqual(['PodDisruptionBudget/api->Deployment/api']);
    expect(rel(refs, 'guards')).toEqual(['NetworkPolicy/api->Deployment/api']);
    expect(rel(refs, 'binds').sort()).toEqual(['RoleBinding/api->Role/api', 'RoleBinding/api->ServiceAccount/api']);
    expect(rel(refs, 'runs-as')).toEqual(['Deployment/api->ServiceAccount/api']);
    expect(rel(refs, 'scrapes')).toEqual(['ServiceMonitor/api->Service/api']);
    expect(rel(refs, 'produces')).toEqual(['Certificate/api->Secret/api-tls']);
    expect(rel(refs, 'issued-by')).toEqual(['Certificate/api->ClusterIssuer/letsencrypt-staging']);
    expect(rel(refs, 'precedes')).toEqual([]);
  });
  it('migrations Job precedes its Deployment', () => {
    const values = { deployments: { api: { migrations: { enabled: true }, containers: { main: { image: 'x', imageTag: '1' } } } } };
    const text = 'apiVersion: batch/v1\nkind: Job\nmetadata:\n  name: api-migrations\n  annotations: {"helm.sh/hook": pre-install}\nspec:\n  template:\n    metadata: {labels: {}}\n    spec: {containers: []}\n';
    const refs = extractRefs(nodesOf(splitManifests('c/templates/job.yaml', text), values));
    expect(rel(refs, 'precedes')).toEqual(['Job/api-migrations->Deployment/api']);
  });
  it('CronJob pod template under jobTemplate yields runs-as/reads refs', () => {
    const text = 'apiVersion: batch/v1\nkind: CronJob\nmetadata:\n  name: beat\nspec:\n  jobTemplate:\n    spec:\n      template:\n        metadata: {labels: {}}\n        spec:\n          serviceAccountName: beat-sa\n          containers: [{name: m, envFrom: [{configMapRef: {name: cfg}}]}]\n';
    const refs = extractRefs(nodesOf(splitManifests('c/templates/cronjob.yaml', text), { cronJobs: { beat: {} } }));
    expect(rel(refs, 'runs-as')).toEqual(['CronJob/beat->ServiceAccount/beat-sa']);
    expect(rel(refs, 'reads')).toEqual(['CronJob/beat->ConfigMap/cfg']);
  });
  it('gateway example attaches to an external Gateway and flags the dangling backend', () => {
    const refs = refsOf('example-05-gateway-api');
    expect(refs.find((r) => r.relation === 'attaches-to')!.targetKind).toBe('Gateway');
    // examples/05 routes to backend "demo-web", which no Service in the release provides.
    expect(rel(refs, 'routes-to')).toEqual(['HTTPRoute/web->Service/demo-web']);
  });
  // example-02 is the only fixture with an Ingress TLS block; it also pins the Ingress path label.
  it('Ingress TLS secret and path-labelled backend', () => {
    const refs = refsOf('example-02-web-with-tls');
    expect(rel(refs, 'tls-from')).toEqual(['Ingress/web->Secret/web-tls']);
    expect(refs.filter((r) => r.relation === 'routes-to').map((r) => `${r.targetKey}[${r.label}]`)).toEqual(['default/Service/web[/]']);
  });
  it('HTTPRoute backendRef namespace is honoured', () => {
    const text = 'apiVersion: gateway.networking.k8s.io/v1\nkind: HTTPRoute\nmetadata:\n  name: r\nspec:\n  parentRefs: [{name: gw, namespace: infra}]\n  rules: [{backendRefs: [{name: svc, namespace: other, port: 80}]}]\n';
    const refs = extractRefs(nodesOf(splitManifests('c/templates/httproute.yaml', text), { httpRoutes: { r: {} } }));
    expect(refs.map((r) => r.targetKey).sort()).toEqual(['infra/Gateway/gw', 'other/Service/svc']);
  });
  it('reads projected volume sources and envFrom refs', () => {
    const dep = { kind: 'Deployment', metadata: { name: 'x' }, spec: { template: { metadata: { labels: {} }, spec: {
      volumes: [{ name: 'p', projected: { sources: [{ configMap: { name: 'cm1' } }, { secret: { name: 's1' } }] } }, { name: 'c', csi: { nodePublishSecretRef: { name: 's2' } } }],
      containers: [{ name: 'm', envFrom: [{ configMapRef: { name: 'cm2' } }, { secretRef: { name: 's3' } }], env: [{ name: 'E', valueFrom: { secretKeyRef: { name: 's4', key: 'k' } } }] }],
      imagePullSecrets: [{ name: 'pull' }] } } } } as any;
    const node = { id: 'default/Deployment/x', key: 'default/Deployment/x', kind: 'Deployment', name: 'x', namespace: 'default', family: 'workload', external: false, conflict: false, hookBadge: false, warnings: [], manifest: { obj: dep } } as any;
    const refs = extractRefs([node]);
    expect(refs.map((r) => `${r.relation}:${r.targetKind}/${r.targetName}`).sort()).toEqual([
      'mounts:ConfigMap/cm1', 'mounts:Secret/s1', 'mounts:Secret/s2',
      'pulls-with:Secret/pull',
      'reads:ConfigMap/cm2', 'reads:Secret/s3', 'reads:Secret/s4',
    ].sort());
  });
  it('implicit references resolve in the object namespace, not the release namespace', () => {
    const text = 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: x\n  namespace: team-a\nspec:\n  template:\n    metadata: {labels: {}}\n    spec:\n      serviceAccountName: sa\n      volumes: [{name: c, configMap: {name: cfg}}]\n      containers: [{name: m, envFrom: [{secretRef: {name: sec}}]}]\n';
    const refs = extractRefs(nodesOf(splitManifests('c/templates/deployment.yaml', text), { deployments: { x: {} } }));
    expect(refs.map((r) => r.targetKey).sort()).toEqual(['team-a/ConfigMap/cfg', 'team-a/Secret/sec', 'team-a/ServiceAccount/sa']);
  });
  it('PDB/NetworkPolicy selectors: {} matches every workload, matchExpressions are honoured', () => {
    const dep = (name: string, labels: Record<string, string>) =>
      `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${name}\nspec:\n  template:\n    metadata:\n      labels: ${JSON.stringify(labels)}\n    spec: {containers: []}\n`;
    const pdb = 'apiVersion: policy/v1\nkind: PodDisruptionBudget\nmetadata:\n  name: all\nspec:\n  selector: {}\n';
    const np = 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: tiered\nspec:\n  podSelector:\n    matchExpressions: [{key: tier, operator: In, values: [web]}]\n';
    const manifests = [
      ...splitManifests('c/templates/deployment.yaml', dep('a', { tier: 'web' }) + '---\n' + dep('b', { tier: 'db' })),
      ...splitManifests('c/templates/pdb.yaml', pdb),
      ...splitManifests('c/templates/networkpolicy.yaml', np),
    ];
    const refs = extractRefs(nodesOf(manifests, { deployments: { a: {}, b: {} } }));
    expect(rel(refs, 'protects').sort()).toEqual(['PodDisruptionBudget/all->Deployment/a', 'PodDisruptionBudget/all->Deployment/b']);
    expect(rel(refs, 'guards')).toEqual(['NetworkPolicy/tiered->Deployment/a']);
  });
  it('stateful-storage covers mounts, reads, precedes and the StatefulSet service', () => {
    const refs = refsOf('stateful-storage');
    expect(rel(refs, 'mounts')).toEqual(['Deployment/files->PersistentVolumeClaim/uploads']);
    // the migrations Job inherits the deployment pod spec, so it reads the same configs
    expect(rel(refs, 'reads').sort()).toEqual([
      'Deployment/web->ConfigMap/app-config', 'Deployment/web->Secret/app-secrets',
      'Job/web-migrations->ConfigMap/app-config', 'Job/web-migrations->Secret/app-secrets',
    ]);
    expect(rel(refs, 'precedes')).toEqual(['Job/web-migrations->Deployment/web']);
    expect(rel(refs, 'governed-by')).toEqual(['StatefulSet/cache->Service/cache-headless']);
    expect(rel(refs, 'selects').sort()).toEqual(['Service/cache-headless->StatefulSet/cache', 'Service/web->Deployment/web']);
  });
});
