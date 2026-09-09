import type { EditOp, ValuesPath } from '../model/ValuesDocument';
import { isFilledObj as isFilledObjGuard, isObj as isObjGuard } from '../model/guards';

export type SecondaryId = 'service' | 'ingress' | 'httpRoute' | 'certificate' | 'hpa' | 'migrations' | 'pdb' | 'serviceMonitor' | 'networkPolicy' | 'rbac' | 'serviceAccount';
type Cfg = Record<string, any>;
export type Secondary = {
  id: SecondaryId; label: string; kinds: ReadonlySet<string>;
  isOn(cfg: Cfg): boolean;
  on(base: ValuesPath, cfg: Cfg, name: string): EditOp[];
  off(base: ValuesPath): EditOp[];
  blocked?(cfg: Cfg, kindKey?: string): string | undefined;   // reason the toggle cannot be switched on
};

// Workload map keys each auto-created resource is rendered for (verified against templates/*.yaml, see expectations.ts).
export const ALL_KINDS = new Set(['deployments', 'statefulSets', 'daemonSets', 'jobs', 'cronJobs']);
export const SVC_KINDS = new Set(['deployments', 'statefulSets']);
export const DEPLOY_ONLY = new Set(['deployments']);
export const SA_KINDS = new Set(['deployments', 'statefulSets', 'daemonSets']);
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
  // isOn predicates use the same truthiness as expectations.ts (which calls them — see Step 4), so the
  // toggle state and the graph never disagree.
  { id: 'service', label: 'Service', kinds: SVC_KINDS, isOn: (c) => !!c.autoCreateService,
    on: (b) => [set([...b, 'autoCreateService'], true)], off: (b) => [setFalse([...b, 'autoCreateService'])],
    // _validation.tpl fails a StatefulSet autoCreateService without serviceName or a container port.
    blocked: (c, kindKey) => (!hasAnyPort(c) ? 'add a container port first (containers.<name>.ports)'
      : kindKey === 'statefulSets' && !c.serviceName ? 'set serviceName first (required by the chart)' : undefined) },
  { id: 'ingress', label: 'Ingress', kinds: DEPLOY_ONLY, isOn: (c) => !!c.autoCreateIngress,
    on: ingressOn, off: (b) => [setFalse([...b, 'autoCreateIngress']), setFalse([...b, 'autoCreateCertificate'])] },
  { id: 'httpRoute', label: 'HTTPRoute', kinds: DEPLOY_ONLY, isOn: (c) => !!c.autoCreateHttpRoute,
    on: (b, c) => [set([...b, 'autoCreateHttpRoute'], true), ...(isFilledObj(c.httpRoute) ? [] : [set([...b, 'httpRoute'], { parentRefs: [{ name: 'gateway' }] })])],
    off: (b) => [setFalse([...b, 'autoCreateHttpRoute'])] },
  { id: 'certificate', label: 'Certificate', kinds: DEPLOY_ONLY, isOn: (c) => !!c.autoCreateCertificate && !!c.autoCreateIngress && !!c.ingress,
    on: (b, c, n) => [...(c.autoCreateIngress === true && isFilledObj(c.ingress) ? [] : ingressOn(b, c, n)), set([...b, 'autoCreateCertificate'], true), ...(isFilledObj(c.certificate) ? [] : [set([...b, 'certificate'], { clusterIssuer: 'letsencrypt' })])],
    off: (b) => [setFalse([...b, 'autoCreateCertificate'])] },
  { id: 'hpa', label: 'HorizontalPodAutoscaler', kinds: DEPLOY_ONLY, isOn: (c) => isObj(c.hpa),
    on: (b) => [set([...b, 'hpa'], { minReplicas: 1, maxReplicas: 3 })], off: (b) => [del([...b, 'hpa'])] },
  { id: 'migrations', label: 'Migrations Job', kinds: DEPLOY_ONLY, isOn: (c) => c.migrations?.enabled === true,   // job.yaml tests `eq true`
    on: (b) => [set([...b, 'migrations', 'enabled'], true)], off: (b) => [setFalse([...b, 'migrations', 'enabled'])] },
  { id: 'pdb', label: 'PodDisruptionBudget', kinds: PDB_KINDS, isOn: (c) => !!c.autoCreatePdb || isFilledObj(c.pdb),
    on: (b) => [set([...b, 'autoCreatePdb'], true)], off: (b) => [setFalse([...b, 'autoCreatePdb']), del([...b, 'pdb'])] },
  { id: 'serviceMonitor', label: 'ServiceMonitor', kinds: SM_KINDS, isOn: (c) => !!c.autoCreateServiceMonitor,
    on: (b) => [set([...b, 'autoCreateServiceMonitor'], true)], off: (b) => [setFalse([...b, 'autoCreateServiceMonitor'])] },
  { id: 'networkPolicy', label: 'NetworkPolicy', kinds: ALL_KINDS, isOn: (c) => !!c.autoCreateNetworkPolicy,
    on: (b, c) => [set([...b, 'autoCreateNetworkPolicy'], true), ...(isFilledObj(c.networkPolicy) ? [] : [set([...b, 'networkPolicy'], { policyTypes: ['Ingress'], ingress: [] })])],
    off: (b) => [setFalse([...b, 'autoCreateNetworkPolicy']), del([...b, 'networkPolicy'])] },
  { id: 'rbac', label: 'Role + RoleBinding', kinds: ALL_KINDS, isOn: (c) => !!c.autoCreateRbac,
    on: (b, c) => [set([...b, 'autoCreateRbac'], true), ...(isFilledObj(c.rbac) ? [] : [set([...b, 'rbac'], { rules: [{ apiGroups: [''], resources: ['configmaps'], verbs: ['get', 'list'] }] })])],
    off: (b) => [setFalse([...b, 'autoCreateRbac']), del([...b, 'rbac'])] },
  { id: 'serviceAccount', label: 'ServiceAccount', kinds: SA_KINDS, isOn: (c) => !!c.autoCreateServiceAccount || isFilledObj(c.serviceAccount),
    on: (b) => [set([...b, 'autoCreateServiceAccount'], true)], off: (b) => [setFalse([...b, 'autoCreateServiceAccount']), del([...b, 'serviceAccount'])] },
];

export function secondariesFor(kindKey: string): Secondary[] {
  return SECONDARY.filter((s) => s.kinds.has(kindKey));
}
