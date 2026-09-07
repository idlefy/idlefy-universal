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
