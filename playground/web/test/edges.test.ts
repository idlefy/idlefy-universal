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
  return extractRefs(nodesOf(manifests, values), 'default');
}
const rel = (refs: any[], r: string) => refs.filter((x) => x.relation === r).map((x) => `${x.source.kind}/${x.source.name}->${x.targetKind}/${x.targetName}`);

describe('extractRefs', () => {
  // full-features (charts/idlefy-universal/ci/full-features-values.yaml): deployments.api with
  // service/ingress/certificate(letsencrypt-staging)/rbac/networkPolicy/pdb/serviceMonitor,
  // statefulSets.cache (serviceName cache-headless), daemonSets.node-info, jobs.init, cronJobs.beacon,
  // configs.app-config, hpas.cache. No migrations. Adjust names here (not in code) if the fixture changes.
  it('full-features covers the core relations', () => {
    const refs = refsOf('full-features');
    expect(rel(refs, 'selects').length).toBeGreaterThan(0);
    expect(rel(refs, 'routes-to').length).toBeGreaterThan(0);
    expect(rel(refs, 'scales')).toEqual(['HorizontalPodAutoscaler/cache->StatefulSet/cache']);
    expect(rel(refs, 'governed-by')).toEqual(['StatefulSet/cache->Service/cache-headless']);
    expect(rel(refs, 'protects').length).toBe(1);
    expect(rel(refs, 'guards').length).toBe(1);
    expect(rel(refs, 'binds').length).toBe(2);
    expect(rel(refs, 'scrapes').length).toBe(1);
    expect(rel(refs, 'produces').length).toBe(1);
    expect(rel(refs, 'issued-by')).toEqual(['Certificate/api->ClusterIssuer/letsencrypt-staging']);
    expect(rel(refs, 'precedes')).toEqual([]);
  });
  it('migrations Job precedes its Deployment', () => {
    const values = { deployments: { api: { migrations: { enabled: true }, containers: { main: { image: 'x', imageTag: '1' } } } } };
    const text = 'apiVersion: batch/v1\nkind: Job\nmetadata:\n  name: api-migrations\n  annotations: {"helm.sh/hook": pre-install}\nspec:\n  template:\n    metadata: {labels: {}}\n    spec: {containers: []}\n';
    const refs = extractRefs(nodesOf(splitManifests('c/templates/job.yaml', text), values), 'default');
    expect(rel(refs, 'precedes')).toEqual(['Job/api-migrations->Deployment/api']);
  });
  it('CronJob pod template under jobTemplate yields runs-as/reads refs', () => {
    const text = 'apiVersion: batch/v1\nkind: CronJob\nmetadata:\n  name: beat\nspec:\n  jobTemplate:\n    spec:\n      template:\n        metadata: {labels: {}}\n        spec:\n          serviceAccountName: beat-sa\n          containers: [{name: m, envFrom: [{configMapRef: {name: cfg}}]}]\n';
    const refs = extractRefs(nodesOf(splitManifests('c/templates/cronjob.yaml', text), { cronJobs: { beat: {} } }), 'default');
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
    const refs = extractRefs(nodesOf(splitManifests('c/templates/httproute.yaml', text), { httpRoutes: { r: {} } }), 'default');
    expect(refs.map((r) => r.targetKey).sort()).toEqual(['infra/Gateway/gw', 'other/Service/svc']);
  });
  it('reads projected volume sources and envFrom refs', () => {
    const dep = { kind: 'Deployment', metadata: { name: 'x' }, spec: { template: { metadata: { labels: {} }, spec: {
      volumes: [{ name: 'p', projected: { sources: [{ configMap: { name: 'cm1' } }, { secret: { name: 's1' } }] } }, { name: 'c', csi: { nodePublishSecretRef: { name: 's2' } } }],
      containers: [{ name: 'm', envFrom: [{ configMapRef: { name: 'cm2' } }, { secretRef: { name: 's3' } }], env: [{ name: 'E', valueFrom: { secretKeyRef: { name: 's4', key: 'k' } } }] }],
      imagePullSecrets: [{ name: 'pull' }] } } } } as any;
    const node = { id: 'default/Deployment/x', key: 'default/Deployment/x', kind: 'Deployment', name: 'x', namespace: 'default', family: 'workload', external: false, conflict: false, hookBadge: false, warnings: [], manifest: { obj: dep } } as any;
    const refs = extractRefs([node], 'default');
    expect(refs.map((r) => `${r.relation}:${r.targetKind}/${r.targetName}`).sort()).toEqual([
      'mounts:ConfigMap/cm1', 'mounts:Secret/s1', 'mounts:Secret/s2',
      'pulls-with:Secret/pull',
      'reads:ConfigMap/cm2', 'reads:Secret/s3', 'reads:Secret/s4',
    ].sort());
  });
});
