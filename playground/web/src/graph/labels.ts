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

export function selectorMatches(matchLabels: Record<string, string> | undefined, labels: Record<string, string> | null): boolean {
  if (!matchLabels || !labels) return false;
  const entries = Object.entries(matchLabels);
  if (entries.length === 0) return false;
  return entries.every(([k, v]) => labels[k] === v);
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
