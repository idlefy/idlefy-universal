import { describe, it, expect } from 'vitest';
import { SECONDARY, secondariesFor } from '../src/graph/secondary';
import { buildExpectations } from '../src/graph/expectations';

const base = ['deployments', 'web'];
const byId = (id: string) => SECONDARY.find((s) => s.id === id)!;

describe('secondary resources', () => {
  it('hides resources the chart does not render for a kind', () => {
    expect(secondariesFor('deployments').map((s) => s.id)).toEqual(['service', 'ingress', 'httpRoute', 'certificate', 'hpa', 'pdb', 'serviceMonitor', 'networkPolicy', 'serviceAccount', 'rbac', 'migrations']);
    expect(secondariesFor('statefulSets').map((s) => s.id)).toEqual(['service', 'pdb', 'serviceMonitor', 'networkPolicy', 'serviceAccount', 'rbac']);
    expect(secondariesFor('daemonSets').map((s) => s.id)).toEqual(['pdb', 'serviceMonitor', 'networkPolicy', 'serviceAccount', 'rbac']);
    expect(secondariesFor('jobs').map((s) => s.id)).toEqual(['networkPolicy', 'rbac']);
    expect(secondariesFor('cronJobs').map((s) => s.id)).toEqual(['networkPolicy', 'rbac']);
  });
  it('isOn mirrors the expectation rules (truthy flags, like expectations.ts)', () => {
    expect(byId('service').isOn({ autoCreateService: true })).toBe(true);
    expect(byId('service').isOn({ autoCreateService: 'yes' })).toBe(true); // truthy, not === true
    expect(byId('certificate').isOn({ autoCreateCertificate: true, autoCreateIngress: true, ingress: {} })).toBe(true); // chart renders with ingress: {}
    expect(byId('service').blocked!({ containers: { m: { ports: { h: { containerPort: 80 } } } } }, 'statefulSets')).toMatch(/serviceName/);
    expect(byId('service').blocked!({ containers: { m: { ports: { h: { containerPort: 80 } } } }, serviceName: 's' }, 'statefulSets')).toBeUndefined();
    expect(byId('pdb').isOn({ pdb: { minAvailable: 1 } })).toBe(true);
    expect(byId('pdb').isOn({ pdb: {} })).toBe(false);
    expect(byId('migrations').isOn({ migrations: { enabled: true } })).toBe(true);
    expect(byId('serviceAccount').isOn({ serviceAccount: { name: 'x' } })).toBe(true);
    expect(byId('hpa').isOn({ hpa: { maxReplicas: 2 } })).toBe(true);
  });
  it('on() adds the flag plus the block the schema requires, without clobbering an existing block', () => {
    expect(byId('networkPolicy').on(base, {}, 'web')).toEqual([
      { op: 'set', path: [...base, 'autoCreateNetworkPolicy'], value: true },
      { op: 'set', path: [...base, 'networkPolicy'], value: { policyTypes: ['Ingress'], ingress: [] } },
    ]);
    expect(byId('networkPolicy').on(base, { networkPolicy: { policyTypes: ['Egress'] } }, 'web')).toEqual([
      { op: 'set', path: [...base, 'autoCreateNetworkPolicy'], value: true },
    ]);
    expect(byId('rbac').on(base, {}, 'web')).toEqual([
      { op: 'set', path: [...base, 'autoCreateRbac'], value: true },
      { op: 'set', path: [...base, 'rbac'], value: { rules: [{ apiGroups: [''], resources: ['configmaps'], verbs: ['get', 'list'] }] } },
    ]);
    expect(byId('ingress').on(base, {}, 'web')).toEqual([
      { op: 'set', path: [...base, 'autoCreateIngress'], value: true },
      { op: 'set', path: [...base, 'ingress'], value: { hosts: [{ host: 'web.example.com', paths: [{ path: '/', pathType: 'Prefix' }] }] } },
    ]);
    expect(byId('certificate').on(base, {}, 'web')).toEqual([
      { op: 'set', path: [...base, 'autoCreateIngress'], value: true },
      { op: 'set', path: [...base, 'ingress'], value: { hosts: [{ host: 'web.example.com', paths: [{ path: '/', pathType: 'Prefix' }] }] } },
      { op: 'set', path: [...base, 'autoCreateCertificate'], value: true },
      { op: 'set', path: [...base, 'certificate'], value: { clusterIssuer: 'letsencrypt' } },
    ]);
    expect(byId('hpa').on(base, {}, 'web')).toEqual([{ op: 'set', path: [...base, 'hpa'], value: { minReplicas: 1, maxReplicas: 3 } }]);
    expect(byId('migrations').on(base, {}, 'web')).toEqual([{ op: 'set', path: [...base, 'migrations', 'enabled'], value: true }]);
    expect(byId('pdb').on(base, {}, 'web')).toEqual([{ op: 'set', path: [...base, 'autoCreatePdb'], value: true }]);
    expect(byId('service').on(base, {}, 'web')).toEqual([{ op: 'set', path: [...base, 'autoCreateService'], value: true }]);
  });
  it('service.blocked() explains a missing container port', () => {
    expect(byId('service').blocked!({ containers: { main: {} } })).toMatch(/port/);
    expect(byId('service').blocked!({ containers: { main: { ports: { http: { containerPort: 80 } } } } })).toBeUndefined();
  });
  it('off() equals the provenance removeAction', () => {
    const values = { deployments: { web: { containers: { main: { ports: { http: { containerPort: 80 } } } }, autoCreateService: true, autoCreateIngress: true, autoCreateRbac: true, rbac: { rules: [] }, migrations: { enabled: true }, hpa: { maxReplicas: 2 } } } };
    const exp = buildExpectations(values, 'default');
    const ra = (kind: string) => exp.find((e) => e.kind === kind && e.provenance.owner)!.provenance.removeAction;
    expect(ra('Service')).toEqual(byId('service').off(base));
    expect(ra('Ingress')).toEqual(byId('ingress').off(base));
    expect(ra('Role')).toEqual(byId('rbac').off(base));
    expect(ra('Job')).toEqual(byId('migrations').off(base));
    expect(ra('HorizontalPodAutoscaler')).toEqual(byId('hpa').off(base));
  });
});
