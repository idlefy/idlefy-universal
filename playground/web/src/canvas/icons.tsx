import type { ReactElement } from 'react';
import deploy from './icons/deploy.svg?raw';
import sts from './icons/sts.svg?raw';
import ds from './icons/ds.svg?raw';
import job from './icons/job.svg?raw';
import cronjob from './icons/cronjob.svg?raw';
import svc from './icons/svc.svg?raw';
import ing from './icons/ing.svg?raw';
import cm from './icons/cm.svg?raw';
import secret from './icons/secret.svg?raw';
import pvc from './icons/pvc.svg?raw';
import sa from './icons/sa.svg?raw';
import role from './icons/role.svg?raw';
import rb from './icons/rb.svg?raw';
import netpol from './icons/netpol.svg?raw';
import hpa from './icons/hpa.svg?raw';
import crd from './icons/crd.svg?raw';
import pod from './icons/pod.svg?raw';
import helm from './icons/helm.svg?raw';
import { ICON_VIEWBOX } from './icons/viewbox';
export { ICON_VIEWBOX };

const inner = (raw: string) => raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const BY_KIND: Record<string, string> = {
  Deployment: deploy, StatefulSet: sts, DaemonSet: ds, Job: job, CronJob: cronjob,
  Service: svc, Ingress: ing, ConfigMap: cm, Secret: secret, PersistentVolumeClaim: pvc,
  ServiceAccount: sa, Role: role, RoleBinding: rb, NetworkPolicy: netpol, HorizontalPodAutoscaler: hpa,
  PodDisruptionBudget: pod, Release: helm,
  // Gateway API, cert-manager and Prometheus operator have no icon in the official set (spec §4).
  HTTPRoute: crd, Gateway: crd, Certificate: crd, Issuer: crd, ClusterIssuer: crd, ServiceMonitor: crd,
};
const cache = new Map<string, string>();
export function iconFor(kind: string): string {
  const raw = BY_KIND[kind] ?? crd;
  let m = cache.get(raw);
  if (!m) { m = inner(raw); cache.set(raw, m); }
  return m;
}

export function KindIcon({ kind, className, title }: { kind: string; className?: string; title?: string }): ReactElement {
  const html = (title ? `<title>${title.replace(/[<&]/g, '')}</title>` : '') + iconFor(kind);
  return <svg className={className ? `kicon ${className}` : 'kicon'} viewBox={ICON_VIEWBOX} aria-hidden={title ? undefined : true} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Dashed frame glyph for groups (no upstream icon exists). */
export function GroupGlyph({ className }: { className?: string }): ReactElement {
  return (
    <svg className={className ? `kicon ${className}` : 'kicon'} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3 2">
      <rect x="3" y="4" width="18" height="16" rx="3" />
    </svg>
  );
}
