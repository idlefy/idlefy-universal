import type { Provenance, RemoveAction } from './types';
import type { ValuesPath } from '../model/ValuesDocument';
import { SECONDARY, SVC_KINDS, SA_KINDS, SM_KINDS, PDB_KINDS, hasAnyPort } from './secondary';
import { isObj } from '../model/guards';

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

const sec = (id: string) => SECONDARY.find((s) => s.id === id)!;
const on = (id: string, cfg: Record<string, any>) => sec(id).isOn(cfg);
const off = (id: string, base: ValuesPath) => sec(id).off(base);

const del = (p: ValuesPath): RemoveAction => ({ op: 'delete', path: p });

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
      const cfg = isObj<Record<string, any>>(raw) ? raw : {};
      const base: ValuesPath = [kindKey, name];
      const owner: Extra = { owner: base };
      // jobs.N renders in job.yaml before the migrations block, hence standalone: true.
      push(kind, name, base, `${kindKey}.${name} present`, [del(base)], { standalone: kindKey === 'jobs' });

      if (kindKey === 'deployments' && on('migrations', cfg)) {
        push('Job', `${name}-migrations`, [...base, 'migrations'], 'migrations.enabled: true', off('migrations', base), owner);
      }
      if (SVC_KINDS.has(kindKey) && on('service', cfg)) {
        // deployments: the chart renders nothing without at least one container port (autoCreateServicePortsList);
        // statefulSets: validation fails instead, so the manifest exists whenever the render succeeds.
        const renders = kindKey === 'statefulSets' || hasAnyPort(cfg);
        if (renders) {
          const svcName = kindKey === 'statefulSets' ? String(cfg.serviceName ?? name) : name;
          push('Service', svcName, [...base, 'service'], 'autoCreateService: true and at least one container port', off('service', base), owner);
        }
      }
      if (kindKey === 'deployments') {
        if (on('ingress', cfg)) push('Ingress', name, [...base, 'ingress'], 'autoCreateIngress: true', off('ingress', base), owner);
        if (on('httpRoute', cfg)) push('HTTPRoute', name, [...base, 'httpRoute'], 'autoCreateHttpRoute: true', off('httpRoute', base), owner);
        if (on('certificate', cfg)) push('Certificate', name, [...base, 'certificate'], 'autoCreateCertificate && autoCreateIngress && ingress', off('certificate', base), owner);
        if (on('hpa', cfg)) push('HorizontalPodAutoscaler', name, [...base, 'hpa'], 'hpa block present', off('hpa', base), { ...owner, templateFile: 'hpa.yaml' });
      }
      if (PDB_KINDS.has(kindKey) && on('pdb', cfg)) {
        push('PodDisruptionBudget', name, [...base, 'pdb'], 'autoCreatePdb: true or pdb block present', off('pdb', base), owner);
      }
      if (SM_KINDS.has(kindKey) && on('serviceMonitor', cfg)) {
        push('ServiceMonitor', name, [...base, 'serviceMonitor'], 'autoCreateServiceMonitor: true', off('serviceMonitor', base), owner);
      }
      // networkpolicy.yaml and rbac.yaml branch on the *defaulted* config, but _defaults.tpl copies
      // only content keys (networkPolicy, securityContext, nodeSelector, …) from <kind>General — never
      // the autoCreate* flags. So both flags are per-instance for all five workload kinds; a flag set
      // only in deploymentsGeneral renders nothing (values.schema.json says so too, and `helm template`
      // confirms it). Reading *General here would over-generate.
      if (on('networkPolicy', cfg)) {
        // Note: <kind>General.networkPolicy is merged in by _defaults.tpl; deleting the instance block may leave an inherited one.
        push('NetworkPolicy', name, [...base, 'networkPolicy'], 'autoCreateNetworkPolicy: true', off('networkPolicy', base), owner);
      }
      if (on('rbac', cfg)) {
        const ra = off('rbac', base);
        push('Role', name, [...base, 'rbac'], 'autoCreateRbac: true', ra, owner);
        push('RoleBinding', name, [...base, 'rbac'], 'autoCreateRbac: true', ra, owner);
      }
      if (SA_KINDS.has(kindKey) && on('serviceAccount', cfg)) {
        const saName = String(cfg.serviceAccount?.name ?? name);
        push('ServiceAccount', saName, [...base, 'serviceAccount'], 'autoCreateServiceAccount: true or serviceAccount block present',
          off('serviceAccount', base), { ...owner, matchBy: { label: 'app.kubernetes.io/name', value: name } });
      }
    }
  }
  return out;
}
