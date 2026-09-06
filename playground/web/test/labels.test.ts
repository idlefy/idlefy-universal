import { describe, it, expect } from 'vitest';
import { podLabelsOf, podTemplateOf, selectorMatches, resourceKey, familyOf } from '../src/graph/labels';
import { loadFixture } from './fixtures';

describe('labels', () => {
  const { manifests } = loadFixture('full-features');
  it('finds the pod template for CronJob under jobTemplate', () => {
    const cj = manifests.find((m) => m.obj.kind === 'CronJob')!;
    expect(podTemplateOf(cj.obj)).toBe(cj.obj.spec.jobTemplate.spec.template);
    const dep = manifests.find((m) => m.obj.kind === 'Deployment')!;
    expect(podTemplateOf(dep.obj)).toBe(dep.obj.spec.template);
    expect(podTemplateOf({ kind: 'Service', metadata: { name: 'x' } })).toBeNull();
  });
  it('matches a Service selector against its Deployment pod labels', () => {
    const svc = manifests.find((m) => m.obj.kind === 'Service' && m.obj.metadata.name === 'api')!;
    const dep = manifests.find((m) => m.obj.kind === 'Deployment' && m.obj.metadata.name === 'api')!;
    expect(selectorMatches(svc.obj.spec.selector, podLabelsOf(dep.obj))).toBe(true);
    expect(selectorMatches({ 'app.kubernetes.io/name': 'other' }, podLabelsOf(dep.obj))).toBe(false);
    expect(selectorMatches(undefined, podLabelsOf(dep.obj))).toBe(false);
  });
  it('builds resource keys and families', () => {
    expect(resourceKey('default', 'Service', 'api')).toBe('default/Service/api');
    expect(familyOf('Deployment')).toBe('workload');
    expect(familyOf('HTTPRoute')).toBe('network');
    expect(familyOf('Whatever')).toBe('external');
  });
});
