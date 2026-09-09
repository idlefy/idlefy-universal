import type { SecondaryId } from '../graph/secondary';

export type Section = { id: string; title: string; keys: readonly string[]; advanced?: boolean };

// spec 2026-09-07 §5.2. Keys are listed for every workload kind; a kind that lacks a key simply does not show it.
export const WORKLOAD_SECTIONS: readonly Section[] = [
  { id: 'workload', title: 'Workload', keys: [
    'replicas', 'serviceType', 'serviceName', 'serviceHeadless', 'schedule', 'timezone', 'suspend', 'concurrencyPolicy',
    'completions', 'parallelism', 'backoffLimit', 'restartPolicy', 'activeDeadlineSeconds', 'ttlSecondsAfterFinished',
    'strategy', 'updateStrategy', 'podManagementPolicy', 'minReadySeconds', 'revisionHistoryLimit', 'priorityClassName',
    'terminationGracePeriodSeconds', 'startingDeadlineSeconds', 'successfulJobsHistoryLimit', 'failedJobsHistoryLimit',
  ] },
  { id: 'containers', title: 'Containers', keys: ['containers', 'initContainers'] },
  { id: 'metadata', title: 'Metadata', keys: ['labels', 'annotations', 'podLabels', 'podAnnotations'] },
  { id: 'placement', title: 'Placement & security', advanced: true, keys: [
    'nodeSelector', 'tolerations', 'affinity', 'autoCreateSoftAntiAffinity', 'topologySpreadConstraints', 'securityContext',
    'serviceAccountName', 'dnsConfig', 'hostAliases', 'hostNetwork', 'hostPID', 'hostIPC', 'volumes', 'volumeClaimTemplates',
    'persistentVolumeClaimRetentionPolicy', 'probes', 'namespace',
  ] },
];
export const OTHER_SECTION: Section = { id: 'other', title: 'Other', keys: [] };

export function partition(keys: string[], sections: readonly Section[]): { section: Section; keys: string[] }[] {
  const left = new Set(keys);
  const out: { section: Section; keys: string[] }[] = [];
  for (const s of sections) {
    const mine = s.keys.filter((k) => left.has(k));
    mine.forEach((k) => left.delete(k));
    if (mine.length) out.push({ section: s, keys: mine });
  }
  if (left.size) out.push({ section: OTHER_SECTION, keys: keys.filter((k) => left.has(k)) });
  return out;
}

export const RELEASE_TITLES: Record<string, string> = {
  generic: 'Release-wide', deploymentsGeneral: 'Defaults for every Deployment', statefulSetsGeneral: 'Defaults for every StatefulSet',
  daemonSetsGeneral: 'Defaults for every DaemonSet', secretRefs: 'Secrets referenced by name',
};

// spec 2026-09-08 §3.3: per-block section tables; blocks without a table render as one section titled by their label.
export const SECONDARY_SECTIONS: Partial<Record<SecondaryId, readonly Section[]>> = {
  ingress: [
    { id: 'routing', title: 'Routing', keys: ['ingressClassName', 'hosts'] },
    { id: 'tls', title: 'TLS', keys: ['tls'] },
    { id: 'metadata', title: 'Metadata', keys: ['annotations', 'labels'] },
  ],
  hpa: [
    { id: 'scaling', title: 'Scaling', keys: ['minReplicas', 'maxReplicas'] },
    { id: 'behaviour', title: 'Behaviour', advanced: true, keys: ['metrics', 'behavior'] },
  ],
  pdb: [
    { id: 'availability', title: 'Availability', keys: ['minAvailable', 'maxUnavailable'] },
    { id: 'metadata', title: 'Metadata', keys: ['annotations', 'labels'] },
  ],
  networkPolicy: [
    { id: 'policy', title: 'Policy', keys: ['policyTypes', 'ingress', 'egress'] },
    { id: 'metadata', title: 'Metadata', keys: ['annotations', 'labels'] },
  ],
  serviceMonitor: [
    { id: 'scraping', title: 'Scraping', keys: ['port', 'path', 'interval', 'scrapeTimeout', 'endpoints'] },
    { id: 'relabeling', title: 'Relabeling', advanced: true, keys: ['relabelings', 'metricRelabelings', 'namespaceSelector'] },
    { id: 'metadata', title: 'Metadata', keys: ['labels'] },
  ],
};

// spec 2026-09-08 §3.3.1: the Service has no values block; its settings are these owner keys.
// Only deployments and statefulSets: the Service secondary's `kinds` is SVC_KINDS, so no other workload kind ever looks this up.
export const SERVICE_OWNER_KEYS: Record<string, readonly string[]> = {
  deployments: ['serviceType'], statefulSets: ['serviceType', 'serviceName', 'serviceHeadless'],
};
