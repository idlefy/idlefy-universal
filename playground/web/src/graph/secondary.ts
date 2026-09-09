import type { EditOp, ValuesPath } from '../model/ValuesDocument';
import { isFilledObj as isFilledObjGuard, isObj as isObjGuard } from '../model/guards';

export type SecondaryId = 'service' | 'ingress' | 'httpRoute' | 'certificate' | 'hpa' | 'pdb' | 'serviceMonitor' | 'networkPolicy' | 'serviceAccount' | 'rbac' | 'migrations';
type Cfg = Record<string, any>;
export type Secondary = {
  id: SecondaryId; label: string; kind: string; hint: string; kinds: ReadonlySet<string>;
  isOn(cfg: Cfg): boolean;
  on(base: ValuesPath, cfg: Cfg, name: string): EditOp[];
  off(base: ValuesPath): EditOp[];
  blocked?(cfg: Cfg, kindKey?: string): string | undefined;   // reason the toggle cannot be switched on
};

// Workload map keys each auto-created resource is rendered for (verified against templates/*.yaml, see expectations.ts).
export const WORKLOAD_KINDS: Record<string, string> = { deployments: 'Deployment', statefulSets: 'StatefulSet', daemonSets: 'DaemonSet', jobs: 'Job', cronJobs: 'CronJob' };
export const WORKLOAD_KEYS: ReadonlySet<string> = new Set(Object.keys(WORKLOAD_KINDS));
export const SVC_KINDS = new Set(['deployments', 'statefulSets']);
const DEPLOY_ONLY = new Set(['deployments']);
export const SA_KINDS = new Set(['deployments', 'statefulSets', 'daemonSets']);
// SM_KINDS and PDB_KINDS coincide with SA_KINDS today (same three workload kinds gate ServiceMonitor and
// PodDisruptionBudget); kept as separate names since they gate unrelated secondaries and may diverge later.
export const SM_KINDS = SA_KINDS;
export const PDB_KINDS = SA_KINDS;

const isObj = (v: unknown): v is Cfg => isObjGuard<Cfg>(v);
const isFilledObj = (v: unknown): v is Cfg => isFilledObjGuard<Cfg>(v);
const set = (path: ValuesPath, value: unknown): EditOp => ({ op: 'set', path, value });
const del = (path: ValuesPath): EditOp => ({ op: 'delete', path });
const setFalse = (path: ValuesPath) => set(path, false);
export const hasAnyPort = (cfg: Cfg): boolean => Object.values(cfg.containers ?? {}).some((c: any) => isObj(c?.ports) && Object.keys(c.ports).length > 0);

const ingressOn = (base: ValuesPath, cfg: Cfg, name: string): EditOp[] => [
  set([...base, 'autoCreateIngress'], true),
  ...(isFilledObj(cfg.ingress) ? [] : [set([...base, 'ingress'], { hosts: [{ host: `${name}.example.com`, paths: [{ path: '/', pathType: 'Prefix' }] }] })]),
];

export const SECONDARY: readonly Secondary[] = [
  // isOn predicates use the same truthiness as expectations.ts, so the
  // toggle state and the graph never disagree.
  { id: 'service', label: 'Service', kind: 'Service', hint: 'expose container ports inside the cluster', kinds: SVC_KINDS, isOn: (c) => !!c.autoCreateService,
    on: (b) => [set([...b, 'autoCreateService'], true)], off: (b) => [setFalse([...b, 'autoCreateService'])],
    // _validation.tpl fails a StatefulSet autoCreateService without serviceName or a container port.
    blocked: (c, kindKey) => (!hasAnyPort(c) ? 'add a container port first (containers.<name>.ports)'
      : kindKey === 'statefulSets' && !c.serviceName ? 'set serviceName first (required by the chart)' : undefined) },
  { id: 'ingress', label: 'Ingress', kind: 'Ingress', hint: 'needs Service', kinds: DEPLOY_ONLY, isOn: (c) => !!c.autoCreateIngress,
    on: ingressOn, off: (b) => [setFalse([...b, 'autoCreateIngress']), setFalse([...b, 'autoCreateCertificate'])] },
  { id: 'httpRoute', label: 'HTTPRoute', kind: 'HTTPRoute', hint: 'needs Service', kinds: DEPLOY_ONLY, isOn: (c) => !!c.autoCreateHttpRoute,
    // _autocreate-httproute.tpl fails without hostnames or generic.ingressesGeneral.domain, like the ingress seed above.
    on: (b, c, n) => [set([...b, 'autoCreateHttpRoute'], true), ...(isFilledObj(c.httpRoute) ? [] : [set([...b, 'httpRoute'], { parentRefs: [{ name: 'gateway' }], hostnames: [{ host: `${n}.example.com` }] })])],
    off: (b) => [setFalse([...b, 'autoCreateHttpRoute'])] },
  { id: 'certificate', label: 'Certificate', kind: 'Certificate', hint: 'needs Ingress with TLS hosts', kinds: DEPLOY_ONLY, isOn: (c) => !!c.autoCreateCertificate && !!c.autoCreateIngress && !!c.ingress,
    on: (b, c, n) => [...(c.autoCreateIngress === true && isFilledObj(c.ingress) ? [] : ingressOn(b, c, n)), set([...b, 'autoCreateCertificate'], true), ...(isFilledObj(c.certificate) ? [] : [set([...b, 'certificate'], { clusterIssuer: 'letsencrypt' })])],
    off: (b) => [setFalse([...b, 'autoCreateCertificate'])] },
  { id: 'hpa', label: 'HorizontalPodAutoscaler', kind: 'HorizontalPodAutoscaler', hint: 'scale on CPU or memory', kinds: DEPLOY_ONLY, isOn: (c) => isObj(c.hpa),
    on: (b) => [set([...b, 'hpa'], { minReplicas: 1, maxReplicas: 3 })], off: (b) => [del([...b, 'hpa'])] },
  { id: 'pdb', label: 'PodDisruptionBudget', kind: 'PodDisruptionBudget', hint: 'keep pods up during node drains', kinds: PDB_KINDS, isOn: (c) => !!c.autoCreatePdb || isFilledObj(c.pdb),
    // _autocreate-pdb.tpl reads pdb.labels unconditionally, so an empty block fails the render; seed the template's default.
    on: (b, c) => [set([...b, 'autoCreatePdb'], true), ...(isFilledObj(c.pdb) ? [] : [set([...b, 'pdb'], { maxUnavailable: 1 })])], off: (b) => [setFalse([...b, 'autoCreatePdb']), del([...b, 'pdb'])] },
  { id: 'serviceMonitor', label: 'ServiceMonitor', kind: 'ServiceMonitor', hint: 'needs Service', kinds: SM_KINDS, isOn: (c) => !!c.autoCreateServiceMonitor,
    on: (b) => [set([...b, 'autoCreateServiceMonitor'], true)], off: (b) => [setFalse([...b, 'autoCreateServiceMonitor'])] },
  { id: 'networkPolicy', label: 'NetworkPolicy', kind: 'NetworkPolicy', hint: 'restrict pod traffic', kinds: WORKLOAD_KEYS, isOn: (c) => !!c.autoCreateNetworkPolicy,
    on: (b, c) => [set([...b, 'autoCreateNetworkPolicy'], true), ...(isFilledObj(c.networkPolicy) ? [] : [set([...b, 'networkPolicy'], { policyTypes: ['Ingress'], ingress: [] })])],
    off: (b) => [setFalse([...b, 'autoCreateNetworkPolicy']), del([...b, 'networkPolicy'])] },
  { id: 'serviceAccount', label: 'ServiceAccount', kind: 'ServiceAccount', hint: 'own identity for the pods', kinds: SA_KINDS, isOn: (c) => !!c.autoCreateServiceAccount || isFilledObj(c.serviceAccount),
    on: (b) => [set([...b, 'autoCreateServiceAccount'], true)], off: (b) => [setFalse([...b, 'autoCreateServiceAccount']), del([...b, 'serviceAccount'])] },
  { id: 'rbac', label: 'Role + RoleBinding', kind: 'Role', hint: 'namespace permissions for the pods', kinds: WORKLOAD_KEYS, isOn: (c) => !!c.autoCreateRbac,
    // _validation.tpl (RB-*) fails autoCreateRbac without a ServiceAccount; chain the SA on unless one is already configured.
    on: (b, c) => [...(c.autoCreateServiceAccount === true || c.serviceAccountName || isFilledObj(c.serviceAccount) ? [] : [set([...b, 'autoCreateServiceAccount'], true)]),
      set([...b, 'autoCreateRbac'], true), ...(isFilledObj(c.rbac) ? [] : [set([...b, 'rbac'], { rules: [{ apiGroups: [''], resources: ['configmaps'], verbs: ['get', 'list'] }] })])],
    off: (b) => [setFalse([...b, 'autoCreateRbac']), del([...b, 'rbac'])] },
  { id: 'migrations', label: 'Migrations Job', kind: 'Job', hint: 'pre-upgrade hook, same image', kinds: DEPLOY_ONLY, isOn: (c) => c.migrations?.enabled === true,   // job.yaml tests `eq true`
    on: (b) => [set([...b, 'migrations', 'enabled'], true)], off: (b) => [setFalse([...b, 'migrations', 'enabled'])] },
];

export const SEC_IDS: ReadonlySet<string> = new Set(SECONDARY.map((s) => s.id));
export const secondaryById = (id: SecondaryId): Secondary => SECONDARY.find((s) => s.id === id)!;

// Flags the switch list owns and the config blocks behind them: reached through the group panel, never as plain fields.
export const OWNED_FLAGS: ReadonlySet<string> = new Set(SECONDARY.map((s) => `autoCreate${s.id[0].toUpperCase()}${s.id.slice(1)}`));

export function secondariesFor(kindKey: string): Secondary[] {
  return SECONDARY.filter((s) => s.kinds.has(kindKey));
}
