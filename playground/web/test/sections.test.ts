import { describe, it, expect } from 'vitest';
import { WORKLOAD_SECTIONS, OTHER_SECTION, partition, RELEASE_TITLES, SECONDARY_SECTIONS, SERVICE_OWNER_KEYS, KIND_LABEL } from '../src/inspector/sections';

describe('sections', () => {
  it('orders known keys by section and sends the rest to Other', () => {
    const out = partition(['tolerations', 'containers', 'replicas', 'labels', 'zzz', 'schedule'], WORKLOAD_SECTIONS);
    expect(out.map((s) => s.section.id)).toEqual(['workload', 'containers', 'metadata', 'placement', 'other']);
    expect(out[0].keys).toEqual(['replicas', 'schedule']);
    expect(out[3].section.advanced).toBe(true);
    expect(out[4]).toEqual({ section: OTHER_SECTION, keys: ['zzz'] });
  });
  it('omits empty sections', () => {
    expect(partition(['replicas'], WORKLOAD_SECTIONS).map((s) => s.section.id)).toEqual(['workload']);
  });
  it('names the release sections', () => {
    expect(RELEASE_TITLES.generic).toBe('Release-wide');
    expect(RELEASE_TITLES.deploymentsGeneral).toBe('Defaults for every Deployment');
    expect(RELEASE_TITLES.secretRefs).toBe('Secrets referenced by name');
  });
  it('secondary section tables match the spec', () => {
    const titles = (id: keyof typeof SECONDARY_SECTIONS) => SECONDARY_SECTIONS[id]!.map((s) => `${s.title}${s.advanced ? '*' : ''}: ${s.keys.join(',')}`);
    expect(titles('ingress')).toEqual(['Routing: ingressClassName,hosts', 'TLS: tls', 'Metadata: annotations,labels']);
    expect(titles('hpa')).toEqual(['Scaling: minReplicas,maxReplicas', 'Behaviour*: metrics,behavior']);
    expect(titles('pdb')).toEqual(['Availability: minAvailable,maxUnavailable', 'Metadata: annotations,labels']);
    expect(titles('networkPolicy')).toEqual(['Policy: policyTypes,ingress,egress', 'Metadata: annotations,labels']);
    expect(titles('serviceMonitor')).toEqual(['Scraping: port,path,interval,scrapeTimeout,endpoints', 'Relabeling*: relabelings,metricRelabelings,namespaceSelector', 'Metadata: labels']);
    expect(SECONDARY_SECTIONS.certificate).toBeUndefined();
  });
  it('service keys per owner kind', () => {
    expect(SERVICE_OWNER_KEYS.deployments).toEqual(['serviceType']);
    expect(SERVICE_OWNER_KEYS.statefulSets).toEqual(['serviceType', 'serviceName', 'serviceHeadless']);
    expect(SERVICE_OWNER_KEYS.daemonSets).toEqual([]);
    expect(KIND_LABEL.cronJobs).toBe('CronJob');
  });
});
