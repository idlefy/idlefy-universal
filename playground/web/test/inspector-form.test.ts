import { describe, it, expect } from 'vitest';
import schema from '../src/chart-bundle/schema.json';
import { buildFields, starterValue, firstSentence, chipValue, itemShape, itemLabelOf, exclusiveKeys, chartRequired } from '../src/inspector/form';
import { classify, schemaAt, resolve } from '../src/inspector/schema';

const root = schema as any;
const dep = schemaAt(root, ['deployments', 'web'])!;

describe('buildFields', () => {
  it('basic tier lists basic, required and present fields only', () => {
    const value = { replicas: 2, containers: { main: { image: 'nginx', imageTag: '1' } }, priorityClassName: 'high' };
    const keys = buildFields(root, dep, ['deployments', 'web'], value, 'basic').map((f) => f.key);
    expect(keys).toContain('replicas');
    expect(keys).toContain('containers');          // required + basic
    expect(keys).toContain('priorityClassName');   // advanced but present
    expect(keys).not.toContain('tolerations');     // advanced, absent
    // fields keep schema property order (no reordering): DeploymentSpec lists `containers` before `replicas`
    // (values.schema.json properties are alphabetically ordered; verified against the source schema)
    expect(keys.indexOf('replicas')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('containers')).toBeLessThan(keys.indexOf('replicas'));
  });
  it('advanced tier lists every property and marks tiers', () => {
    const fields = buildFields(root, dep, ['deployments', 'web'], {}, 'advanced');
    expect(fields.length).toBe(Object.keys(dep.properties ?? (root.$defs.DeploymentSpec.properties)).length);
    expect(fields.find((f) => f.key === 'replicas')?.tier).toBe('basic');
    expect(fields.find((f) => f.key === 'tolerations')?.tier).toBe('advanced');
  });
  it('carries path, value, presence and required', () => {
    const f = buildFields(root, dep, ['deployments', 'web'], { replicas: 4 }, 'advanced');
    const rep = f.find((x) => x.key === 'replicas')!;
    expect(rep).toMatchObject({ path: ['deployments', 'web', 'replicas'], value: 4, present: true, required: false, widget: { kind: 'number' } });
    expect(f.find((x) => x.key === 'containers')).toMatchObject({ present: false, required: true, value: undefined });
  });
  it('hide() removes keys (used for toggle-managed autoCreate* flags)', () => {
    const keys = buildFields(root, dep, ['deployments', 'web'], {}, 'advanced', { hide: (k) => k.startsWith('autoCreate') }).map((f) => f.key);
    expect(keys.some((k) => k.startsWith('autoCreate'))).toBe(false);
  });
  it('starterValue prefers the first example and falls back to required-only objects', () => {
    expect(starterValue(root, root.$defs.PortSpec)).toEqual({ containerPort: 8080, protocol: 'TCP', servicePort: 80 });
    expect(starterValue(root, { type: 'object', required: ['name'], properties: { name: { type: 'string' }, x: { type: 'integer' } } })).toEqual({ name: '' });
    expect(starterValue(root, { type: 'integer' })).toBe(0);
    expect(starterValue(root, { type: 'boolean' })).toBe(false);
  });
  it('starterValue prefers `default` over `examples`', () => {
    // DeploymentSpec.autoCreateRbac has both `default: false` and `examples: [true]` — default wins.
    expect(starterValue(root, root.$defs.DeploymentSpec.properties.autoCreateRbac)).toBe(false);
  });
  it('starterValue seeds the integer branch of a bare oneOf/anyOf IntOrString node', () => {
    // '' matches neither `type: integer` nor `^[0-9]+%$`; and 0 is falsy in Go templates, so
    // _autocreate-pdb.tpl would emit neither key and render a PDB with an empty spec.
    const minAvailable = schemaAt(root, ['deployments', 'web', 'pdb', 'minAvailable'])!;
    expect(starterValue(root, minAvailable)).toBe(1);
    expect(starterValue(root, schemaAt(root, ['services', 'x', 'ports'])!)).toBeTruthy();
  });
  it('starterValue answers a pattern-constrained string from the shared table, and fixes subdomains', () => {
    expect(starterValue(root, root.$defs.CronJobSpec.properties.schedule)).toBe('0 3 * * *');
    expect(starterValue(root, root.$defs.ServiceMonitorConfig.properties.interval)).toBe('30s');
    expect(starterValue(root, root.$defs.PvcSpec.properties.size)).toBe('1Gi');
    // the `hosts` chip inserts examples[0] of the *array*, whose item is `{subdomain: api, …}` —
    // the chart fails that without generic.ingressesGeneral.domain (QA H-5)
    expect(starterValue(root, schemaAt(root, ['ingresses', 'x', 'hosts'])!)).toEqual([{ host: 'api.example.com', paths: [{ path: '/', pathType: 'Prefix' }] }]);
    expect(starterValue(root, schemaAt(root, ['deployments', 'web', 'httpRoute', 'hostnames'])!)).toEqual([{ host: 'api.example.com' }]);
  });
  it('starterValue deep-clones example/default-derived values (no live reference into the schema module)', () => {
    const sv = starterValue(root, root.$defs.PortSpec);
    const original = (schema as any).$defs.PortSpec.examples[0].http;
    expect(sv).toEqual(original);
    expect(sv).not.toBe(original);
    (sv as Record<string, unknown>).containerPort = 9999;
    expect(original.containerPort).toBe(8080);
  });
  describe('starterValue JS type matches widget kind (table test over real $defs)', () => {
    const defs = ['DeploymentSpec', 'PortSpec', 'PdbConfig', 'ServicePort', 'ContainerSpec'];
    for (const defName of defs) {
      const props = root.$defs[defName]?.properties ?? {};
      for (const [key, propSchema] of Object.entries<any>(props)) {
        it(`${defName}.${key}`, () => {
          const widget = classify(root, propSchema);
          const sv = starterValue(root, propSchema);
          switch (widget.kind) {
            case 'boolean': expect(typeof sv).toBe('boolean'); break;
            case 'number': expect(typeof sv).toBe('number'); break;
            // an IntOrString widget is a text box that commits digits as a number (TextField.emit),
            // so a numeric starter is the right JS type for it
            case 'string': expect(typeof sv === 'string' || (widget.intOrString === true && typeof sv === 'number')).toBe(true); break;
            case 'list': expect(Array.isArray(sv)).toBe(true); break;
            default: expect(typeof sv === 'object' && sv !== null).toBe(true); break;
          }
        });
      }
    }
  });
  it('does not offer the other half of a oneOf pair, and locks the half that is set', () => {
    const pdb = schemaAt(root, ['deployments', 'web', 'pdb'])!;
    const p = ['deployments', 'web', 'pdb'];
    const set = buildFields(root, pdb, p, { maxUnavailable: 1 }, 'advanced');
    expect(set.map((f) => f.key)).not.toContain('minAvailable');
    expect(set.find((f) => f.key === 'maxUnavailable')).toMatchObject({ present: true, locked: true });
    // with neither set, both are offered and neither is locked
    const none = buildFields(root, pdb, p, {}, 'advanced');
    expect(none.filter((f) => f.key === 'minAvailable' || f.key === 'maxUnavailable').map((f) => f.locked)).toEqual([false, false]);
  });
  it('locks schema-required keys and the keys only the chart requires', () => {
    const dep = schemaAt(root, ['deployments', 'web'])!;
    const value = { containers: { main: { image: 'n', imageTag: '1' } } };
    expect(buildFields(root, dep, ['deployments', 'web'], value, 'advanced').find((f) => f.key === 'containers')).toMatchObject({ required: true, locked: true });
    const ing = schemaAt(root, ['ingresses', 'site'])!;
    const hosts = buildFields(root, ing, ['ingresses', 'site'], { hosts: [{ host: 'a.example.com' }] }, 'advanced').find((f) => f.key === 'hosts')!;
    // IngressConfig does not require `hosts`; _validation.tpl fails "configuration must not be empty".
    expect(hosts.required).toBe(false);
    expect(hosts.locked).toBe(true);
    // a workload's auto-created ingress locks `hosts` too: clearing it leaves `ingress: {}` and
    // autoCreateCertificate then fails. Over-locking an optional key costs a × that nothing needs;
    // under-locking breaks the render.
    const wl = buildFields(root, schemaAt(root, ['deployments', 'web', 'ingress'])!, ['deployments', 'web', 'ingress'], { hosts: [{ host: 'a.example.com' }] }, 'advanced').find((f) => f.key === 'hosts')!;
    expect(wl.locked).toBe(true);
  });
  it('chartRequired matches by path shape, not by $defs name', () => {
    expect(chartRequired(['ingresses', 'site', 'hosts'])).toBe(true);
    expect(chartRequired(['deployments', 'web', 'ingress', 'hosts'])).toBe(true);   // clearing it leaves ingress: {}, which autoCreateCertificate rejects
    expect(chartRequired(['deployments', 'web', 'httpRoute', 'hostnames'])).toBe(true);
    expect(chartRequired(['httpRoutes', 'r', 'rules'])).toBe(true);
    expect(chartRequired(['httpRoutes', 'r', 'rules', 0, 'matches'])).toBe(true);   // a numeric index matches '*'
    expect(chartRequired(['statefulSets', 'db', 'networkPolicy', 'ingress'])).toBe(true);
    expect(chartRequired(['deployments', 'web', 'networkPolicy', 'egress'])).toBe(true);
    expect(chartRequired(['deployments', 'web', 'replicas'])).toBe(false);
    // Jobs/CronJobs have no ServiceAccount toggle; autoCreateRbac=true needs this name (RB-3).
    expect(chartRequired(['jobs', 'app', 'serviceAccountName'])).toBe(true);
    expect(chartRequired(['cronJobs', 'app', 'serviceAccountName'])).toBe(true);
    expect(chartRequired(['deployments', 'web', 'serviceAccountName'])).toBe(false);
  });
});

describe('firstSentence / chipValue', () => {
  it('cuts at the first sentence end, not the first line', () => {
    expect(firstSentence('Additional DNS names beyond the ingress.tls hosts (subject\nalternative names). Second sentence.')).toBe('Additional DNS names beyond the ingress.tls hosts (subject\nalternative names).');
    expect(firstSentence('No period here\nsecond line')).toBe('No period here');
    expect(firstSentence(undefined)).toBeUndefined();
    expect(firstSentence('  ')).toBeUndefined();
  });
  it('does not cut inside an "e.g." / "i.e." abbreviation', () => {
    expect(firstSentence('Metric describing a non-pod Kubernetes object (e.g. an Ingress). Second sentence.'))
      .toBe('Metric describing a non-pod Kubernetes object (e.g. an Ingress).');
    expect(firstSentence('Uses the given value (i.e. as-is). Second sentence.'))
      .toBe('Uses the given value (i.e. as-is).');
  });
  it('chip for a boolean turns it on; others use the starter value', () => {
    const dep = schemaAt(root, ['deployments', 'web'])!;
    const fields = buildFields(root, dep, ['deployments', 'web'], {}, 'advanced');
    const f = (k: string) => fields.find((x) => x.key === k)!;
    expect(chipValue(root, f('autoCreateSoftAntiAffinity'))).toBe(true);
    expect(typeof chipValue(root, f('replicas'))).toBe('number');   // default or examples[0] or 0
    expect(chipValue(root, f('labels'))).toEqual(expect.any(Object));
  });
});

describe('itemShape', () => {
  const shape = (p: (string | number)[]) => itemShape(root, resolve(root, schemaAt(root, p)!).items);
  it('env: name + value as a pair, valueFrom behind the expander', () => {
    expect(shape(['deployments', 'web', 'containers', 'main', 'env'])).toMatchObject({ identifying: 'name', leaves: [['value']], extras: ['valueFrom'], pair: true });
  });
  it('secretRefs item: name + secretKeyRef.name / secretKeyRef.key (name first); the boolean `optional` keeps secretKeyRef behind the expander', () => {
    const items = resolve(root, root.properties.secretRefs.additionalProperties).items;
    expect(itemShape(root, items)).toEqual({ identifying: 'name', leaves: [['secretKeyRef', 'name'], ['secretKeyRef', 'key']], extras: ['secretKeyRef'], required: ['name', 'secretKeyRef'], pair: true, exclusive: [] });
  });
  it('required leaves are reported', () => {
    expect(itemShape(root, resolve(root, schemaAt(root, ['deployments', 'web', 'containers', 'main', 'env'])!).items).required).toEqual(['name']);
  });
  it('hosts: host + subdomain pair, paths behind the expander, host xor subdomain', () => {
    // IngressHost states "one of host / subdomain" with anyOf + not; HttpRouteHostname states the
    // same thing with oneOf. Both must produce the same exclusive group.
    expect(shape(['deployments', 'web', 'ingress', 'hosts'])).toEqual({ identifying: 'host', leaves: [['subdomain']], extras: ['paths'], required: [], pair: true, exclusive: ['host', 'subdomain'] });
    expect(shape(['deployments', 'web', 'httpRoute', 'hostnames'])).toMatchObject({ identifying: 'host', leaves: [['subdomain']], pair: true, exclusive: ['host', 'subdomain'] });
  });
  it('env: value xor valueFrom, even though valueFrom is an extra rather than a leaf', () => {
    expect(shape(['deployments', 'web', 'containers', 'main', 'env']).exclusive).toEqual(['value', 'valueFrom']);
  });
  it('exclusiveKeys finds the three groups this schema declares and invents none', () => {
    expect(exclusiveKeys(root, root.$defs.PdbConfig)).toEqual(['minAvailable', 'maxUnavailable']);
    expect(exclusiveKeys(root, root.$defs.EnvVar)).toEqual(['value', 'valueFrom']);
    expect(exclusiveKeys(root, root.$defs.IngressHost)).toEqual(['host', 'subdomain']);
    expect(exclusiveKeys(root, root.$defs.HttpRouteHostname)).toEqual(['host', 'subdomain']);
    expect(exclusiveKeys(root, root.$defs.SecretRefEntry)).toEqual([]);
    expect(exclusiveKeys(root, root.$defs.DeploymentSpec)).toEqual([]);
  });
  it('tls and hostAliases: an identifying leaf plus a list → block', () => {
    expect(shape(['deployments', 'web', 'ingress', 'tls'])).toMatchObject({ identifying: 'secretName', leaves: [], extras: ['hosts'], pair: false });
    expect(shape(['deployments', 'web', 'hostAliases'])).toMatchObject({ identifying: 'ip', pair: false });
  });
  it('tolerations: more than two remaining leaves → block', () => {
    expect(shape(['deployments', 'web', 'tolerations'])).toMatchObject({ identifying: 'key', pair: false });
  });
  it('item labels', () => {
    expect(itemLabelOf('secretRefs')).toBe('Variable');
    expect(itemLabelOf('env')).toBe('Variable');
    expect(itemLabelOf('hosts')).toBe('Host');
    expect(itemLabelOf('tolerations')).toBe('Toleration');
    expect(itemLabelOf('whatever')).toBe('Item');
  });
});
