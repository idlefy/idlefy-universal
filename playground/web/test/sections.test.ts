import { describe, it, expect } from 'vitest';
import { WORKLOAD_SECTIONS, OTHER_SECTION, partition, RELEASE_TITLES } from '../src/inspector/sections';

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
});
