import type { SecondaryId } from '../graph/secondary';
import { isObj } from '../model/guards';

export const ORDER: readonly SecondaryId[] = ['service', 'ingress', 'httpRoute', 'certificate', 'hpa', 'pdb', 'serviceMonitor', 'networkPolicy', 'serviceAccount', 'rbac', 'migrations'];

const KIND: Record<SecondaryId, string> = {
  service: 'Service', ingress: 'Ingress', httpRoute: 'HTTPRoute', certificate: 'Certificate', hpa: 'HorizontalPodAutoscaler', pdb: 'PodDisruptionBudget',
  serviceMonitor: 'ServiceMonitor', networkPolicy: 'NetworkPolicy', serviceAccount: 'ServiceAccount', rbac: 'Role', migrations: 'Job',
};
export const kindOfSecondary = (id: SecondaryId): string => KIND[id];

const HINT: Record<SecondaryId, string> = {
  service: 'expose container ports inside the cluster', ingress: 'needs Service', httpRoute: 'needs Service', certificate: 'needs Ingress with TLS hosts',
  hpa: 'scale on CPU or memory', pdb: 'keep pods up during node drains', serviceMonitor: 'needs Service', networkPolicy: 'restrict pod traffic',
  serviceAccount: 'own identity for the pods', rbac: 'namespace permissions for the pods', migrations: 'pre-upgrade hook, same image',
};
export const hintOf = (id: SecondaryId): string => HINT[id];

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** One line describing the configured block; never throws on partial config. */
export function summaryOf(id: SecondaryId, cfg: Record<string, any>): string {
  switch (id) {
    case 'service': {
      const ports: string[] = [];
      for (const c of Object.values(cfg.containers ?? {})) for (const p of Object.values(isObj((c as any)?.ports) ? (c as any).ports : {})) {
        const sp = (p as any)?.servicePort ?? (p as any)?.containerPort;
        if (sp !== undefined) ports.push(`:${sp}`);
      }
      return `${cfg.serviceType ?? 'ClusterIP'}${ports.length ? ' · ' + ports.join(', ') : ''}`;
    }
    case 'ingress': {
      const hosts: any[] = Array.isArray(cfg.ingress?.hosts) ? cfg.ingress.hosts : [];
      const first = hosts[0]?.host ?? (hosts[0]?.subdomain ? `${hosts[0].subdomain}.<domain>` : undefined);
      return first ? `${first}${hosts.length > 1 ? ` +${hosts.length - 1}` : ''}` : 'no hosts yet';
    }
    case 'httpRoute': {
      const refs: any[] = Array.isArray(cfg.httpRoute?.parentRefs) ? cfg.httpRoute.parentRefs : [];
      return refs.length ? `via ${refs.map((r) => r?.name).filter(Boolean).join(', ')}` : 'no parentRefs yet';
    }
    case 'certificate': return cfg.certificate?.clusterIssuer ? `ClusterIssuer ${cfg.certificate.clusterIssuer}` : cfg.certificate?.issuer ? `Issuer ${cfg.certificate.issuer}` : 'no issuer yet';
    case 'hpa': return `${cfg.hpa?.minReplicas ?? 1}–${cfg.hpa?.maxReplicas ?? '?'} replicas`;
    case 'pdb': return cfg.pdb?.minAvailable !== undefined ? `minAvailable ${cfg.pdb.minAvailable}` : cfg.pdb?.maxUnavailable !== undefined ? `maxUnavailable ${cfg.pdb.maxUnavailable}` : 'minAvailable 1';
    case 'serviceMonitor': return cfg.serviceMonitor?.interval ? `every ${cfg.serviceMonitor.interval}` : 'scrapes the Service';
    case 'networkPolicy': { const t: string[] = Array.isArray(cfg.networkPolicy?.policyTypes) ? cfg.networkPolicy.policyTypes : []; return t.length ? t.join(', ') : 'Ingress'; }
    case 'serviceAccount': return 'own ServiceAccount for the pods';
    case 'rbac': return plural(Array.isArray(cfg.rbac?.rules) ? cfg.rbac.rules.length : 0, 'rule');
    case 'migrations': return cfg.migrations?.command ? `runs ${[].concat(cfg.migrations.command).join(' ')}` : 'pre-upgrade hook, same image';
  }
}

/** Group-panel Workload row (spec 2026-09-08 §3.1). Ruling: DaemonSets have no replicas, so they show the image only. */
export function workloadSummary(kindKey: string, cfg: Record<string, any>): string {
  const first = Object.values(cfg.containers ?? {})[0] as any;
  const image = first?.image ? `${first.image}${first.imageTag ? `:${first.imageTag}` : ''}` : 'no image';
  if (kindKey === 'cronJobs') return typeof cfg.schedule === 'string' ? cfg.schedule : 'no schedule';
  if (kindKey === 'jobs' || kindKey === 'daemonSets') return image;
  return `${plural(typeof cfg.replicas === 'number' ? cfg.replicas : 1, 'replica')} · ${image}`;
}
