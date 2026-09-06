import type { KubeObject } from '../engine/types';
import type { Family, ResourceKey } from './types';

export function resourceKey(ns: string, kind: string, name: string): ResourceKey { return `${ns}/${kind}/${name}`; }

export function podTemplateOf(obj: KubeObject): any | null {
  switch (obj.kind) {
    case 'Deployment': case 'StatefulSet': case 'DaemonSet': case 'Job': return obj.spec?.template ?? null;
    case 'CronJob': return obj.spec?.jobTemplate?.spec?.template ?? null;
    default: return null;
  }
}

export function podLabelsOf(obj: KubeObject): Record<string, string> | null {
  return podTemplateOf(obj)?.metadata?.labels ?? null;
}

export type LabelSelector = {
  matchLabels?: Record<string, string>;
  matchExpressions?: { key: string; operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist'; values?: string[] }[];
};

/**
 * Kubernetes LabelSelector semantics: matchLabels and matchExpressions are ANDed; an empty
 * selector (`{}`) matches everything (policy/v1 PDB, NetworkPolicy podSelector). `undefined`
 * means "no selector" and matches nothing.
 */
export function selectorMatches(selector: LabelSelector | undefined, labels: Record<string, string> | null): boolean {
  if (!selector) return false;
  const l = labels ?? {};
  const byLabel = Object.entries(selector.matchLabels ?? {}).every(([k, v]) => l[k] === v);
  const byExpr = (selector.matchExpressions ?? []).every((e) => {
    switch (e.operator) {
      case 'In': return e.key in l && (e.values ?? []).includes(l[e.key]);
      case 'NotIn': return !(e.key in l) || !(e.values ?? []).includes(l[e.key]);
      case 'Exists': return e.key in l;
      case 'DoesNotExist': return !(e.key in l);
      default: return false;
    }
  });
  return byLabel && byExpr;
}

/** Short human form of a selector for the placeholder node when nothing matches. */
export function selectorText(selector: LabelSelector): string {
  const parts = Object.entries(selector.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`);
  for (const e of selector.matchExpressions ?? []) {
    if (e.operator === 'In') parts.push(`${e.key} in (${(e.values ?? []).join(',')})`);
    else if (e.operator === 'NotIn') parts.push(`${e.key} notin (${(e.values ?? []).join(',')})`);
    else if (e.operator === 'Exists') parts.push(e.key);
    else parts.push(`!${e.key}`);
  }
  return parts.length ? parts.join(',') : '{}';
}

const FAMILIES: Record<string, Family> = {
  Deployment: 'workload', StatefulSet: 'workload', DaemonSet: 'workload', Job: 'workload', CronJob: 'workload',
  Service: 'network', Ingress: 'network', HTTPRoute: 'network', NetworkPolicy: 'security', Gateway: 'network',
  ConfigMap: 'config', Secret: 'config',
  ServiceAccount: 'security', Role: 'security', RoleBinding: 'security', Certificate: 'security', Issuer: 'security', ClusterIssuer: 'security',
  ServiceMonitor: 'observability', PodDisruptionBudget: 'scaling', HorizontalPodAutoscaler: 'scaling',
  PersistentVolumeClaim: 'storage',
};
export function familyOf(kind: string): Family { return FAMILIES[kind] ?? 'external'; }
