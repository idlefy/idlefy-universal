import { describe, it, expect } from 'vitest';
import schema from '../src/chart-bundle/schema.json';
import { resolve, schemaAt, classify, conditionalHints } from '../src/inspector/schema';

const root = schema as any;

describe('inspector schema resolver', () => {
  it('schemaAt walks properties, additionalProperties maps and $refs', () => {
    expect(schemaAt(root, [])).toBe(root);
    // schemaAt returns the *unresolved* node ({$ref: '#/$defs/DeploymentSpec'}); resolve() derefs it.
    expect(resolve(root, schemaAt(root, ['deployments', 'web'])!).properties.replicas.type).toBe('integer');
    expect(schemaAt(root, ['deployments', 'web', 'containers', 'main', 'ports', 'http', 'containerPort'])?.type).toBe('integer');
    expect(schemaAt(root, ['deployments', 'web', 'nope'])).toBeUndefined();
    expect(schemaAt(root, ['deployments', 'web', 'service'])).toBeUndefined();   // auto-created Service has no schema node
  });
  it('resolve merges allOf and keeps x-ui-tier', () => {
    const dep = resolve(root, root.properties.deployments.additionalProperties);
    expect(dep.properties.replicas['x-ui-tier']).toBe('basic');
    expect(dep.required).toEqual(['containers']);
    expect(dep.allOf).toBeUndefined();
  });
  it('classifies widgets by structure', () => {
    const dep = resolve(root, schemaAt(root, ['deployments', 'web'])!);
    const p = dep.properties;
    expect(classify(root, p.replicas)).toEqual({ kind: 'number', integer: true, min: 0 });
    expect(classify(root, p.autoCreateService)).toEqual({ kind: 'boolean' });
    expect(classify(root, p.serviceType)).toEqual({ kind: 'string', enum: ['ClusterIP', 'NodePort', 'LoadBalancer'] });
    expect(classify(root, p.containers).kind).toBe('map');
    expect(classify(root, p.labels)).toEqual({ kind: 'keyvalue' });
    expect(classify(root, p.affinity)).toEqual({ kind: 'yaml' });          // k8s.io.* ref
    expect(classify(root, p.volumes)).toEqual({ kind: 'yaml' });           // array of objects
    expect(classify(root, p.pdb).kind).toBe('object');
    const c = resolve(root, schemaAt(root, ['deployments', 'web', 'containers', 'main'])!).properties;
    expect(classify(root, c.args)).toEqual({ kind: 'list' });
    expect(classify(root, c.resources).kind).toBe('object');               // has properties despite additionalProperties: true
    const pvc = resolve(root, schemaAt(root, ['persistentVolumeClaims', 'x'])!).properties;
    expect(classify(root, pvc.accessModes).kind).toBe('list');
    expect((classify(root, pvc.accessModes) as any).enum).toContain('ReadWriteOnce');
  });
  it('turns allOf if/then into hints', () => {
    const hints = conditionalHints(root, root.properties.deployments.additionalProperties);
    expect(hints).toContain('autoCreateCertificate: true requires autoCreateIngress: true');
    expect(hints).toContain('autoCreateNetworkPolicy: true requires networkPolicy');
    expect(hints).toContain('autoCreateRbac: true requires rbac');
  });
});
