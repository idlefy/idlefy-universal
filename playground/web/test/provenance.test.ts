import { describe, it, expect } from 'vitest';
import { buildExpectations } from '../src/graph/expectations';
import { attachProvenance } from '../src/graph/provenance';
import { loadFixture } from './fixtures';
import { splitManifests } from '../src/engine/split';

const fixtures = ['minimal', 'full-features', 'example-01-hello-world', 'example-02-web-with-tls', 'example-03-observed-api', 'example-04-isolated-workload', 'example-05-gateway-api'];

describe('provenance completeness', () => {
  for (const f of fixtures) {
    it(`maps every manifest in ${f} and over-generates nothing`, () => {
      const { manifests, values } = loadFixture(f);
      const { byManifest, unconsumed } = attachProvenance(manifests, buildExpectations(values, 'default'), 'default');
      const unmapped = manifests.filter((m) => !byManifest.get(m)).map((m) => `${m.obj.kind}/${m.obj.metadata.name}`);
      expect(unmapped).toEqual([]);
      expect(unconsumed.map((e) => `${e.kind}/${e.name}`)).toEqual([]);
    });
  }
});

describe('provenance rules', () => {
  it('StatefulSet service resolves via serviceName', () => {
    const values = { statefulSets: { db: { serviceName: 'db-headless', autoCreateService: true, containers: { main: { image: 'pg', imageTag: '16', ports: { pg: { containerPort: 5432 } } } } } } };
    const ex = buildExpectations(values, 'default');
    const svc = ex.find((e) => e.kind === 'Service')!;
    expect(svc.name).toBe('db-headless');
    expect(svc.provenance.path).toEqual(['statefulSets', 'db', 'service']);
    expect(svc.provenance.owner).toEqual(['statefulSets', 'db']);
  });
  it('daemonSets never expect an auto-created Service (chart renders none)', () => {
    const values = { daemonSets: { agent: { autoCreateService: true, containers: { main: { image: 'x', imageTag: '1', ports: { m: { containerPort: 1 } } } } } } };
    expect(buildExpectations(values, 'default').filter((e) => e.kind === 'Service')).toEqual([]);
  });
  it('ServiceAccount with custom name matches by label', () => {
    const values = { deployments: { api: { autoCreateServiceAccount: true, serviceAccount: { name: 'api-sa' }, containers: { main: { image: 'x', imageTag: '1' } } } } };
    const ex = buildExpectations(values, 'default');
    const sa = ex.find((e) => e.kind === 'ServiceAccount')!;
    expect(sa.name).toBe('api-sa');
    expect(sa.matchBy).toEqual({ label: 'app.kubernetes.io/name', value: 'api' });
    const manifests = splitManifests('c/templates/serviceaccount.yaml', 'apiVersion: v1\nkind: ServiceAccount\nmetadata:\n  name: api-sa\n  labels:\n    app.kubernetes.io/name: api\n');
    expect(attachProvenance(manifests, ex, 'default').byManifest.get(manifests[0])?.path).toEqual(['deployments', 'api', 'serviceAccount']);
  });
  it('jobs.N-migrations takes precedence over deployments.N.migrations', () => {
    const values = { deployments: { api: { migrations: { enabled: true }, containers: { main: { image: 'x', imageTag: '1' } } } }, jobs: { 'api-migrations': { containers: { main: { image: 'y', imageTag: '1' } } } } };
    const ex = buildExpectations(values, 'default');
    const jobs = ex.filter((e) => e.kind === 'Job' && e.name === 'api-migrations');
    expect(jobs.length).toBe(2);
    const two = 'apiVersion: batch/v1\nkind: Job\nmetadata:\n  name: api-migrations\n---\napiVersion: batch/v1\nkind: Job\nmetadata:\n  name: api-migrations\n';
    const manifests = splitManifests('c/templates/job.yaml', two);
    const { byManifest } = attachProvenance(manifests, ex, 'default');
    expect(byManifest.get(manifests[0])?.path).toEqual(['jobs', 'api-migrations']);
    expect(byManifest.get(manifests[1])?.path).toEqual(['deployments', 'api', 'migrations']);
  });
  it('standalone and auto-created Service with the same name are matched in template order', () => {
    const values = { services: { api: { ports: [{ name: 'http', port: 80, targetPort: 8080 }] } }, deployments: { api: { autoCreateService: true, containers: { main: { image: 'x', imageTag: '1', ports: { http: { containerPort: 8080 } } } } } } };
    const ex = buildExpectations(values, 'default');
    const two = 'apiVersion: v1\nkind: Service\nmetadata:\n  name: api\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: api\n';
    const manifests = splitManifests('c/templates/service.yaml', two);
    const { byManifest } = attachProvenance(manifests, ex, 'default');
    expect(byManifest.get(manifests[0])?.path).toEqual(['services', 'api']);
    expect(byManifest.get(manifests[1])?.path).toEqual(['deployments', 'api', 'service']);
  });
  it('HPA collision is disambiguated by template file, not by order', () => {
    const values = { hpas: { api: { scaleTargetRef: { kind: 'Deployment', name: 'api' }, minReplicas: 1, maxReplicas: 2 } }, deployments: { api: { hpa: { minReplicas: 1, maxReplicas: 3 }, containers: { main: { image: 'x', imageTag: '1' } } } } };
    const ex = buildExpectations(values, 'default');
    const hpa = 'apiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: api\n';
    const auto = splitManifests('c/templates/hpa.yaml', hpa);            // sorts before standalone-hpa.yaml
    const standalone = splitManifests('c/templates/standalone-hpa.yaml', hpa);
    const { byManifest } = attachProvenance([...auto, ...standalone], ex, 'default');
    expect(byManifest.get(auto[0])?.path).toEqual(['deployments', 'api', 'hpa']);
    expect(byManifest.get(standalone[0])?.path).toEqual(['hpas', 'api']);
  });
  it('uses the caller namespace when manifests carry none', () => {
    const values = { deployments: { api: { containers: { main: { image: 'x', imageTag: '1' } } } } };
    const manifests = splitManifests('c/templates/deployment.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n');
    const { byManifest } = attachProvenance(manifests, buildExpectations(values, 'prod'), 'prod');
    expect(byManifest.get(manifests[0])?.path).toEqual(['deployments', 'api']);
  });
  // The brief expected deploymentsGeneral.autoCreateNetworkPolicy to be inherited by every deployment/job/cronJob.
  // The chart disagrees: _defaults.tpl copies only content keys from <kind>General, never the autoCreate* flags
  // ("The autoCreateNetworkPolicy flag itself is per-instance only" — values.schema.json), and `helm template` on
  // the values below renders no NetworkPolicy at all. Reading *General would over-generate, so the flags are read
  // per-instance — for all five workload kinds, which networkpolicy.yaml/rbac.yaml do range over.
  it('NetworkPolicy and RBAC flags are per-instance for all five workload kinds; *General does not propagate them', () => {
    const c = { containers: { main: { image: 'x', imageTag: '1' } } };
    const np = { autoCreateNetworkPolicy: true, networkPolicy: { policyTypes: ['Ingress'], ingress: [] } };
    const values = {
      deploymentsGeneral: { autoCreateNetworkPolicy: true, autoCreateRbac: true, networkPolicy: { policyTypes: ['Ingress'] } },
      deployments: { api: c },
      statefulSets: { sts: { ...c, ...np, serviceName: 'sts-headless' } },
      daemonSets: { ds: { ...c, ...np } },
      jobs: { j: { ...c, ...np, autoCreateRbac: true, serviceAccountName: 'existing-sa', rbac: { rules: [{ apiGroups: [''], resources: ['configmaps'], verbs: ['get'] }] } } },
      cronJobs: { cj: { ...c, ...np, schedule: '*/5 * * * *' } },
    };
    const ex = buildExpectations(values, 'default');
    expect(ex.filter((e) => e.kind === 'NetworkPolicy').map((e) => e.name).sort()).toEqual(['cj', 'ds', 'j', 'sts']);
    expect(ex.filter((e) => e.kind === 'Role' || e.kind === 'RoleBinding').map((e) => `${e.kind}/${e.name}`)).toEqual(['Role/j', 'RoleBinding/j']);
  });
  it('networkPolicy removeAction flips the flag and deletes the block', () => {
    const values = { deployments: { api: { autoCreateNetworkPolicy: true, networkPolicy: { policyTypes: ['Ingress'] }, containers: { main: { image: 'x', imageTag: '1' } } } } };
    const np = buildExpectations(values, 'default').find((e) => e.kind === 'NetworkPolicy')!;
    expect(np.provenance.removeAction).toEqual([
      { op: 'set', path: ['deployments', 'api', 'autoCreateNetworkPolicy'], value: false },
      { op: 'delete', path: ['deployments', 'api', 'networkPolicy'] },
    ]);
  });
});
