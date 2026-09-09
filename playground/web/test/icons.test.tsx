// test/icons.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { iconFor, KindIcon } from '../src/canvas/icons';
import { ICON_VIEWBOX } from '../src/canvas/icons/viewbox';

afterEach(cleanup);
const KINDS = ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'Service', 'Ingress', 'HTTPRoute', 'Gateway', 'ConfigMap', 'Secret',
  'PersistentVolumeClaim', 'ServiceAccount', 'Role', 'RoleBinding', 'NetworkPolicy', 'Certificate', 'Issuer', 'ClusterIssuer', 'ServiceMonitor',
  'PodDisruptionBudget', 'HorizontalPodAutoscaler', 'Release'];

describe('kind icons', () => {
  it('every known kind has drawable, recolorable markup', () => {
    for (const k of KINDS) {
      const m = iconFor(k);
      expect(m, k).toContain('<path');
      expect(m, k).not.toContain('326ce5');
      expect(m, k).toContain('currentColor');
    }
  });
  it('distinct kinds get distinct official glyphs; CRD-based kinds share the CRD glyph', () => {
    expect(iconFor('Deployment')).not.toBe(iconFor('StatefulSet'));
    expect(iconFor('Certificate')).toBe(iconFor('ServiceMonitor'));
    expect(iconFor('SomethingUnknown')).toBe(iconFor('Certificate'));
    expect(iconFor('Release')).toContain('circle');
  });
  it('KindIcon renders an svg with the shared viewBox and class', () => {
    const { container } = render(<KindIcon kind="Service" className="extra" title="Service" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe(ICON_VIEWBOX);
    expect(svg.getAttribute('class')).toBe('kicon extra');
    expect(svg.querySelector('title')!.textContent).toBe('Service');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(render(<KindIcon kind="Service" />).container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});
