import type { EditOp, ValuesPath } from '../model/ValuesDocument';
import { isFilledObj as isFilledObjGuard, isObj as isObjGuard } from '../model/guards';

export type SecondaryId = 'service' | 'ingress' | 'httpRoute' | 'certificate' | 'hpa' | 'pdb' | 'serviceMonitor' | 'networkPolicy' | 'serviceAccount' | 'rbac' | 'migrations';
type Cfg = Record<string, any>;
export type Secondary = {
  id: SecondaryId; label: string; kind: string; hint: string; kinds: ReadonlySet<string>;
  isOn(cfg: Cfg): boolean;
  on(base: ValuesPath, cfg: Cfg, name: string): EditOp[];
  off(base: ValuesPath): EditOp[];
  blocked?(cfg: Cfg, kindKey?: string): string | undefined;      // reason the toggle cannot be switched on
  // Turning a toggle off can be just as invalid as turning it on: the chart fails a workload whose
  // autoCreateRbac is true and has no ServiceAccount left. The switch is disabled while this returns
  // a reason, and the reason replaces the summary line.
  blockedOff?(cfg: Cfg, kindKey?: string): string | undefined;   // reason it cannot be switched off
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
/** Shared by every switch whose resource is built out of container ports: Service and ServiceMonitor. */
export const NEEDS_PORT = 'add a container port first (containers.<name>.ports)';

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
    blocked: (c, kindKey) => (!hasAnyPort(c) ? NEEDS_PORT
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
    on: (b) => [set([...b, 'autoCreateServiceMonitor'], true)], off: (b) => [setFalse([...b, 'autoCreateServiceMonitor'])],
    // _autocreate-servicemonitor.tpl leaves $metricsPort empty and renders `endpoints:\n  - port:` —
    // a successful render of an object the API server rejects. Same gate as the Service switch.
    blocked: (c) => (hasAnyPort(c) ? undefined : NEEDS_PORT) },
  { id: 'networkPolicy', label: 'NetworkPolicy', kind: 'NetworkPolicy', hint: 'restrict pod traffic', kinds: WORKLOAD_KEYS, isOn: (c) => !!c.autoCreateNetworkPolicy,
    on: (b, c) => [set([...b, 'autoCreateNetworkPolicy'], true), ...(isFilledObj(c.networkPolicy) ? [] : [set([...b, 'networkPolicy'], { policyTypes: ['Ingress'], ingress: [] })])],
    off: (b) => [setFalse([...b, 'autoCreateNetworkPolicy']), del([...b, 'networkPolicy'])] },
  { id: 'serviceAccount', label: 'ServiceAccount', kind: 'ServiceAccount', hint: 'own identity for the pods', kinds: SA_KINDS, isOn: (c) => !!c.autoCreateServiceAccount || isFilledObj(c.serviceAccount),
    on: (b) => [set([...b, 'autoCreateServiceAccount'], true)], off: (b) => [setFalse([...b, 'autoCreateServiceAccount']), del([...b, 'serviceAccount'])],
    // _validation.tpl RB-3 fails autoCreateRbac with no resolvable ServiceAccount. Blocking the off
    // direction keeps the user's rbac.rules; clearing them for them would be a silent data loss.
    blockedOff: (c) => (c.autoCreateRbac && !c.serviceAccountName ? 'turn Role + RoleBinding off first (RBAC needs a ServiceAccount)' : undefined) },
  { id: 'rbac', label: 'Role + RoleBinding', kind: 'Role', hint: 'namespace permissions for the pods', kinds: WORKLOAD_KEYS, isOn: (c) => !!c.autoCreateRbac,
    // _validation.tpl (RB-*) fails autoCreateRbac without a ServiceAccount; chain the SA on unless one is already configured.
    on: (b, c) => [...(c.autoCreateServiceAccount === true || c.serviceAccountName || isFilledObj(c.serviceAccount) ? [] : [set([...b, 'autoCreateServiceAccount'], true)]),
      set([...b, 'autoCreateRbac'], true), ...(isFilledObj(c.rbac) ? [] : [set([...b, 'rbac'], { rules: [{ apiGroups: [''], resources: ['configmaps'], verbs: ['get', 'list'] }] })])],
    off: (b) => [setFalse([...b, 'autoCreateRbac']), del([...b, 'rbac'])],
    // JobSpec/CronJobSpec are additionalProperties:false with neither autoCreateServiceAccount nor
    // serviceAccount, and templates/serviceaccount.yaml never loops jobs/cronJobs — so the SA chain
    // above is schema-invalid there and seeding serviceAccountName would bind to an SA nobody
    // creates. Block instead, and let on() take its existing no-chain branch once the name is set.
    blocked: (c, kindKey) => (!SA_KINDS.has(kindKey ?? '') && !c.serviceAccountName
      ? 'set serviceAccountName first (the chart cannot create a ServiceAccount for a Job or CronJob)' : undefined) },
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

/**
 * The one toggle-state rule, shared by `AutoCreated.tsx`, `SecondaryPanel.tsx`, and every toggle
 * on/off check in `test/edit-integrity.test.ts` — previously five identical lines written out in
 * each of the first two (and the `blocked`/`isOn`-guarded-`blockedOff` pair re-derived a third way in
 * the sweeps), which is exactly the kind of drift Task 10's review caught (a sweep calling
 * `blockedOff` without the `isOn` guard). `blocked` still shows as the reason while the switch is
 * already on (an on-but-blocked Service must keep explaining itself), but only `blockedOff` disables
 * it there — the direction the switch would move in decides which reason is disabling. Sharing this
 * one function means the sweeps' exemptions can never drift from the UI's disabled states again.
 */
export function toggleState(sec: Secondary, cfg: Cfg, kindKey: string, disabled: boolean): { on: boolean; why?: string; isDisabled: boolean } {
  const on = sec.isOn(cfg);
  const blocked = sec.blocked?.(cfg, kindKey);
  const blockedOff = on ? sec.blockedOff?.(cfg, kindKey) : undefined;
  return { on, why: blockedOff ?? blocked, isDisabled: disabled || (!on && !!blocked) || !!blockedOff };
}
