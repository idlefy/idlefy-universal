import { describe, it, expect } from 'vitest';
import { humanize } from '../src/inspector/form';

describe('humanize', () => {
  it('splits camelCase into a sentence-case phrase', () => {
    expect(humanize('serviceAccountName')).toBe('Service account name');
    expect(humanize('replicas')).toBe('Replicas');
    expect(humanize('podAnnotations')).toBe('Pod annotations');
  });
  it('keeps well-known acronyms upper-case', () => {
    expect(humanize('hostIPC')).toBe('Host IPC');
    expect(humanize('ttlSecondsAfterFinished')).toBe('TTL seconds after finished');
    expect(humanize('httpRoute')).toBe('HTTP route');
    expect(humanize('hpa')).toBe('HPA');
  });
  it('treats dashes and underscores as word breaks', () => {
    expect(humanize('ephemeral-storage')).toBe('Ephemeral storage');
  });
});
