import { secondaryById, type SecondaryId } from '../graph/secondary';
import { isObj } from '../model/guards';

export const kindOfSecondary = (id: SecondaryId): string => secondaryById(id).kind;

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

/** Group-panel Workload row. Ruling: DaemonSets have no replicas, so they show the image only. */
export function workloadSummary(kindKey: string, cfg: Record<string, any>): string {
  const first = Object.values(cfg.containers ?? {})[0] as any;
  const image = first?.image ? `${first.image}${first.imageTag ? `:${first.imageTag}` : ''}` : 'no image';
  if (kindKey === 'cronJobs') return typeof cfg.schedule === 'string' ? cfg.schedule : 'no schedule';
  if (kindKey === 'jobs' || kindKey === 'daemonSets') return image;
  return `${plural(typeof cfg.replicas === 'number' ? cfg.replicas : 1, 'replica')} · ${image}`;
}

/**
 * Every `<mapKey>/<name> · <container>` whose `secretRefs` list names `group`, in document order.
 * `_validation.tpl` fails a container that references a group `.Values.secretRefs` does not hold —
 * and skips the check entirely when `secretRefs` is empty, so removing the *last* group leaves a
 * dangling reference that renders "successfully". Tolerates any shape: this walks the live document.
 */
export function secretRefUsers(values: Record<string, unknown>, group: string): string[] {
  const out: string[] = [];
  for (const mapKey of ['deployments', 'statefulSets', 'daemonSets', 'jobs', 'cronJobs']) {
    const entries = values[mapKey];
    if (!isObj(entries)) continue;
    for (const [name, cfg] of Object.entries(entries)) {
      if (!isObj(cfg)) continue;
      for (const listKey of ['containers', 'initContainers']) {
        const containers = (cfg as Record<string, unknown>)[listKey];
        if (!isObj(containers)) continue;
        for (const [cn, c] of Object.entries(containers)) {
          const refs = isObj(c) ? (c as Record<string, unknown>).secretRefs : undefined;
          if (Array.isArray(refs) && refs.includes(group)) out.push(`${mapKey}/${name} · ${cn}`);
        }
      }
    }
  }
  return out;
}

/**
 * Every `hosts[]`/`hostnames[]` entry anywhere in the document that sets `subdomain` — a workload's
 * auto-created `ingress.hosts` / `httpRoute.hostnames`, or a standalone `ingresses.*.hosts` /
 * `httpRoutes.*.hostnames`. `_computed-ingress-host.tpl` combines `subdomain` with
 * `generic.ingressesGeneral.domain` ("Global domain must be specified when a subdomain is used."), so
 * while any of these exist that domain cannot be cleared without breaking the render. Tolerates any
 * shape: this walks the live document, mirroring `secretRefUsers`.
 */
export function subdomainUsers(values: Record<string, unknown>): string[] {
  const out: string[] = [];
  const scan = (label: string, hosts: unknown, hostsKey: string) => {
    if (!Array.isArray(hosts)) return;
    hosts.forEach((h, i) => {
      if (isObj(h) && typeof (h as Record<string, unknown>).subdomain === 'string') out.push(`${label} · ${hostsKey}.${i}.subdomain`);
    });
  };
  for (const mapKey of ['deployments', 'statefulSets', 'daemonSets', 'jobs', 'cronJobs']) {
    const entries = values[mapKey];
    if (!isObj(entries)) continue;
    for (const [name, cfg] of Object.entries(entries)) {
      if (!isObj(cfg)) continue;
      const c = cfg as Record<string, unknown>;
      scan(`${mapKey}/${name}`, isObj(c.ingress) ? (c.ingress as Record<string, unknown>).hosts : undefined, 'ingress.hosts');
      scan(`${mapKey}/${name}`, isObj(c.httpRoute) ? (c.httpRoute as Record<string, unknown>).hostnames : undefined, 'httpRoute.hostnames');
    }
  }
  const ingresses = values.ingresses;
  if (isObj(ingresses)) for (const [name, cfg] of Object.entries(ingresses)) if (isObj(cfg)) scan(`ingresses/${name}`, (cfg as Record<string, unknown>).hosts, 'hosts');
  const httpRoutes = values.httpRoutes;
  if (isObj(httpRoutes)) for (const [name, cfg] of Object.entries(httpRoutes)) if (isObj(cfg)) scan(`httpRoutes/${name}`, (cfg as Record<string, unknown>).hostnames, 'hostnames');
  return out;
}

/**
 * The one runtime (document-wide) `lockedPaths` lock the playground computes today — see
 * `buildFields`'s own doc comment for why this can't be expressed as static path shape. While
 * `subdomainUsers` finds a live reference anywhere in the document, `generic.ingressesGeneral.domain`
 * cannot be cleared (`_computed-ingress-host.tpl` needs it), and neither can the `ingressesGeneral`
 * block itself — its own clear × would take `domain` with it in one click, the same silent escape the
 * leaf lock is there to prevent. Empty `Set` (not `undefined`) when no such reference exists, so every
 * caller can pass the result straight through `lockedPaths?.has(...)` without an extra branch.
 */
export function subdomainLockedPaths(values: Record<string, unknown>): Set<string> {
  return subdomainUsers(values).length > 0 ? new Set(['generic.ingressesGeneral.domain', 'generic.ingressesGeneral']) : new Set();
}
