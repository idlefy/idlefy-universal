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
  it('classifies inline k8s-passthrough objects (non-scalar examples) as yaml, plain maps as keyvalue', () => {
    const dep = resolve(root, schemaAt(root, ['deployments', 'web'])!);
    // labels/nodeSelector: additionalProperties:true, but every example value is scalar -> keyvalue.
    expect(classify(root, dep.properties.labels)).toEqual({ kind: 'keyvalue' });
    expect(classify(root, dep.properties.nodeSelector)).toEqual({ kind: 'keyvalue' });
    // httpGet: additionalProperties:true, but an example holds `httpHeaders: [...]` (non-scalar) -> yaml.
    const httpGet = schemaAt(root, ['deployments', 'web', 'containers', 'main', 'probes', 'livenessProbe', 'httpGet']);
    expect(classify(root, httpGet!)).toEqual({ kind: 'yaml' });
  });
  it('classifies IntOrString unions as string widgets flagged intOrString', () => {
    expect(classify(root, schemaAt(root, ['deployments', 'web', 'pdb', 'minAvailable'])!)).toEqual({ kind: 'string', intOrString: true });
    const dep = resolve(root, schemaAt(root, ['deployments', 'web'])!);
    expect(classify(root, dep.properties.serviceType)).toEqual({ kind: 'string', enum: ['ClusterIP', 'NodePort', 'LoadBalancer'] });
  });
  it('resolve merges properties/required from non-if/then allOf members (synthetic)', () => {
    const syntheticRoot = {};
    const node = {
      type: 'object',
      properties: { a: { type: 'string' } },
      allOf: [
        { properties: { b: { type: 'integer' } }, required: ['b'] },
        { if: { properties: { a: { const: 'x' } } }, then: { required: ['c'] } },
      ],
    };
    const r = resolve(syntheticRoot, node);
    expect(r.allOf).toBeUndefined();
    expect(r.properties.a.type).toBe('string');
    expect(r.properties.b.type).toBe('integer');
    expect(r.required).toContain('b');
  });
});
