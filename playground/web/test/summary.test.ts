import { describe, it, expect } from 'vitest';
import { ORDER, kindOfSecondary, hintOf, summaryOf, workloadSummary } from '../src/inspector/summary';
import { SECONDARY } from '../src/graph/secondary';

describe('secondary summaries', () => {
  it('ORDER lists every secondary id exactly once', () => {
    expect(new Set(ORDER)).toEqual(new Set(SECONDARY.map((s) => s.id)));
  });
  it('maps ids to node kinds', () => {
    expect(kindOfSecondary('rbac')).toBe('Role');
    expect(kindOfSecondary('migrations')).toBe('Job');
    expect(kindOfSecondary('hpa')).toBe('HorizontalPodAutoscaler');
  });
  it('describes what is configured', () => {
    expect(summaryOf('service', { serviceType: 'NodePort', containers: { a: { ports: { http: { containerPort: 8080, servicePort: 80 } } } } })).toBe('NodePort · :80');
    expect(summaryOf('service', { containers: { a: { ports: { http: { containerPort: 8080 }, grpc: { containerPort: 9000 } } } } })).toBe('ClusterIP · :8080, :9000');
    expect(summaryOf('rbac', { rbac: { rules: [{}, {}] } })).toBe('2 rules');
    expect(summaryOf('rbac', { rbac: { rules: [{}] } })).toBe('1 rule');
    expect(summaryOf('networkPolicy', { networkPolicy: { policyTypes: ['Ingress', 'Egress'] } })).toBe('Ingress, Egress');
    expect(summaryOf('hpa', { hpa: { minReplicas: 2, maxReplicas: 5 } })).toBe('2–5 replicas');
    expect(summaryOf('ingress', { ingress: { hosts: [{ host: 'a.example.com' }, { subdomain: 'b' }] } })).toBe('a.example.com +1');
    expect(summaryOf('certificate', { certificate: { clusterIssuer: 'letsencrypt' } })).toBe('ClusterIssuer letsencrypt');
    expect(summaryOf('pdb', { pdb: { minAvailable: 1 } })).toBe('minAvailable 1');
    expect(summaryOf('serviceAccount', {})).toBe('own ServiceAccount for the pods');
    expect(hintOf('ingress')).toBe('needs Service');
    expect(hintOf('hpa')).toBe('scale on CPU or memory');
  });
  it('one-line workload summaries', () => {
    expect(workloadSummary('deployments', { replicas: 3, containers: { main: { image: 'nginx', imageTag: '1.27' } } })).toBe('3 replicas · nginx:1.27');
    expect(workloadSummary('statefulSets', { containers: { main: { image: 'redis' } } })).toBe('1 replica · redis');
    expect(workloadSummary('daemonSets', { containers: { main: { image: 'fluentd' } } })).toBe('fluentd');
    expect(workloadSummary('cronJobs', { schedule: '*/5 * * * *' })).toBe('*/5 * * * *');
    expect(workloadSummary('jobs', {})).toBe('no image');
  });
});
