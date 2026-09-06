import type { Provenance, RemoveAction } from './types';
import type { ValuesPath } from '../model/ValuesDocument';

export type Expectation = {
  kind: string; name: string; namespace: string;
  provenance: Provenance;
  standalone: boolean;                                   // top-level map entry (rendered before auto-created in the same file)
  matchBy?: { label: string; value: string };            // extra discriminator (ServiceAccount)
  templateFile?: string;                                 // basename of the template that renders it, when kinds split by file (HPA)
};

// Which workload maps each auto-created resource is rendered for. Verified against templates/*.yaml:
// service.yaml → deployments, statefulSets; ingress/httproute/certificate/hpa/migrations → deployments only;
// pdb.yaml, serviceaccount.yaml, _autocreate-servicemonitor → deployments, statefulSets, daemonSets;
// networkpolicy.yaml, rbac.yaml → all five kinds.
const WORKLOAD_KINDS: Record<string, string> = { deployments: 'Deployment', statefulSets: 'StatefulSet', daemonSets: 'DaemonSet', jobs: 'Job', cronJobs: 'CronJob' };
const SVC_KINDS = new Set(['deployments', 'statefulSets']);
const SA_KINDS = new Set(['deployments', 'statefulSets', 'daemonSets']);
const SM_KINDS = new Set(['deployments', 'statefulSets', 'daemonSets']);
const PDB_KINDS = new Set(['deployments', 'statefulSets', 'daemonSets']);

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const setFalse = (p: ValuesPath): RemoveAction => ({ op: 'set', path: p, value: false });
const del = (p: ValuesPath): RemoveAction => ({ op: 'delete', path: p });

function hasAnyPort(cfg: Record<string, any>): boolean {
  return Object.values(cfg.containers ?? {}).some((c: any) => isObj(c?.ports) && Object.keys(c.ports).length > 0);
}

type Extra = { owner?: ValuesPath; standalone?: boolean; matchBy?: Expectation['matchBy']; templateFile?: string };

export function buildExpectations(values: any, ns: string): Expectation[] {
  const out: Expectation[] = [];
  const push = (kind: string, name: string, path: ValuesPath, governingCondition: string, removeAction: RemoveAction[], extra: Extra = {}) =>
    out.push({ kind, name, namespace: ns, standalone: extra.standalone ?? false, matchBy: extra.matchBy, templateFile: extra.templateFile,
      provenance: { path, governingCondition, removeAction, owner: extra.owner } });

  const topLevel = (key: string, kind: string, templateFile?: string) => {
    for (const name of Object.keys(values?.[key] ?? {})) push(kind, name, [key, name], `${key}.${name} present`, [del([key, name])], { standalone: true, templateFile });
  };

  // Standalone entities. `jobs` is a workload kind and is handled in the loop below (standalone: true).
  topLevel('services', 'Service');
  topLevel('ingresses', 'Ingress');
  topLevel('httpRoutes', 'HTTPRoute');
  topLevel('hpas', 'HorizontalPodAutoscaler', 'standalone-hpa.yaml');
  topLevel('persistentVolumeClaims', 'PersistentVolumeClaim');
  for (const [name, cfg] of Object.entries<any>(values?.configs ?? {})) {
    push(cfg?.type === 'secret' ? 'Secret' : 'ConfigMap', name, ['configs', name], `configs.${name} present`, [del(['configs', name])], { standalone: true });
  }

  for (const [kindKey, kind] of Object.entries(WORKLOAD_KINDS)) {
    for (const [name, raw] of Object.entries<any>(values?.[kindKey] ?? {})) {
      const cfg = isObj(raw) ? raw : {};
      const base: ValuesPath = [kindKey, name];
      const owner: Extra = { owner: base };
      // jobs.N renders in job.yaml before the migrations block, hence standalone: true.
      push(kind, name, base, `${kindKey}.${name} present`, [del(base)], { standalone: kindKey === 'jobs' });

      if (kindKey === 'deployments' && cfg.migrations?.enabled === true) {
        push('Job', `${name}-migrations`, [...base, 'migrations'], 'migrations.enabled: true', [setFalse([...base, 'migrations', 'enabled'])], owner);
      }
      if (SVC_KINDS.has(kindKey) && cfg.autoCreateService) {
        // deployments: the chart renders nothing without at least one container port (autoCreateServicePortsList);
        // statefulSets: validation fails instead, so the manifest exists whenever the render succeeds.
        const renders = kindKey === 'statefulSets' || hasAnyPort(cfg);
        if (renders) {
          const svcName = kindKey === 'statefulSets' ? String(cfg.serviceName ?? name) : name;
          push('Service', svcName, [...base, 'service'], 'autoCreateService: true and at least one container port', [setFalse([...base, 'autoCreateService'])], owner);
        }
      }
      if (kindKey === 'deployments') {
        if (cfg.autoCreateIngress) push('Ingress', name, [...base, 'ingress'], 'autoCreateIngress: true', [setFalse([...base, 'autoCreateIngress']), setFalse([...base, 'autoCreateCertificate'])], owner);
        if (cfg.autoCreateHttpRoute) push('HTTPRoute', name, [...base, 'httpRoute'], 'autoCreateHttpRoute: true', [setFalse([...base, 'autoCreateHttpRoute'])], owner);
        if (cfg.autoCreateCertificate && cfg.autoCreateIngress && cfg.ingress) push('Certificate', name, [...base, 'certificate'], 'autoCreateCertificate && autoCreateIngress && ingress', [setFalse([...base, 'autoCreateCertificate'])], owner);
        if (isObj(cfg.hpa)) push('HorizontalPodAutoscaler', name, [...base, 'hpa'], 'hpa block present', [del([...base, 'hpa'])], { ...owner, templateFile: 'hpa.yaml' });
      }
      if (PDB_KINDS.has(kindKey) && (cfg.autoCreatePdb || isObj(cfg.pdb))) {
        push('PodDisruptionBudget', name, [...base, 'pdb'], 'autoCreatePdb: true or pdb block present', [setFalse([...base, 'autoCreatePdb']), del([...base, 'pdb'])], owner);
      }
      if (SM_KINDS.has(kindKey) && cfg.autoCreateServiceMonitor) {
        push('ServiceMonitor', name, [...base, 'serviceMonitor'], 'autoCreateServiceMonitor: true', [setFalse([...base, 'autoCreateServiceMonitor'])], owner);
      }
      // networkpolicy.yaml and rbac.yaml branch on the *defaulted* config, but _defaults.tpl copies
      // only content keys (networkPolicy, securityContext, nodeSelector, …) from <kind>General — never
      // the autoCreate* flags. So both flags are per-instance for all five workload kinds; a flag set
      // only in deploymentsGeneral renders nothing (values.schema.json says so too, and `helm template`
      // confirms it). Reading *General here would over-generate.
      const npOn = cfg.autoCreateNetworkPolicy;
      const rbacOn = cfg.autoCreateRbac;
      if (npOn) {
        // Note: <kind>General.networkPolicy is merged in by _defaults.tpl; deleting the instance block may leave an inherited one.
        push('NetworkPolicy', name, [...base, 'networkPolicy'], 'autoCreateNetworkPolicy: true', [setFalse([...base, 'autoCreateNetworkPolicy']), del([...base, 'networkPolicy'])], owner);
      }
      if (rbacOn) {
        const ra = [setFalse([...base, 'autoCreateRbac']), del([...base, 'rbac'])];
        push('Role', name, [...base, 'rbac'], 'autoCreateRbac: true', ra, owner);
        push('RoleBinding', name, [...base, 'rbac'], 'autoCreateRbac: true', ra, owner);
      }
      if (SA_KINDS.has(kindKey) && (cfg.autoCreateServiceAccount || isObj(cfg.serviceAccount))) {
        const saName = String(cfg.serviceAccount?.name ?? name);
        push('ServiceAccount', saName, [...base, 'serviceAccount'], 'autoCreateServiceAccount: true or serviceAccount block present',
          [setFalse([...base, 'autoCreateServiceAccount']), del([...base, 'serviceAccount'])], { ...owner, matchBy: { label: 'app.kubernetes.io/name', value: name } });
      }
    }
  }
  return out;
}
