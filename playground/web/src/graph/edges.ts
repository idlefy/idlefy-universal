import type { GraphNode, ResourceKey, EdgeRelation } from './types';
import { podLabelsOf, podTemplateOf, resourceKey, selectorMatches, selectorText, type LabelSelector } from './labels';

export type RawRef = {
  source: GraphNode; targetKey: ResourceKey; targetKind: string; targetName: string; targetNs: string;
  relation: EdgeRelation; label?: string; bySelector?: boolean;
};

export function extractRefs(nodes: GraphNode[]): RawRef[] {
  const refs: RawRef[] = [];
  // Implicit references (volumes, envFrom, serviceAccountName, roleRef, ...) resolve in the
  // referencing object's own namespace, never the release namespace.
  const ref = (source: GraphNode, kind: string, name: string | undefined, relation: EdgeRelation, label?: string, targetNs = source.namespace, bySelector = false) => {
    if (!name) return;
    refs.push({ source, targetKind: kind, targetName: name, targetNs, targetKey: resourceKey(targetNs, kind, name), relation, label, bySelector });
  };
  // `selector` is a full LabelSelector (or a plain matchLabels map for Service.spec.selector).
  const bySelector = (source: GraphNode, selector: LabelSelector | undefined, relation: EdgeRelation, targetKind: string | null, useObjectLabels: boolean) => {
    if (!selector) return;
    const hits = nodes.filter((n) => (targetKind ? n.kind === targetKind : podTemplateOf(n.manifest!.obj) !== null) && n.namespace === source.namespace
      && selectorMatches(selector, useObjectLabels ? n.manifest!.obj.metadata.labels ?? null : podLabelsOf(n.manifest!.obj)));
    if (hits.length === 0) { ref(source, targetKind ?? 'Pod', `selector:${selectorText(selector)}`, relation, undefined, source.namespace, true); return; }
    if (hits.length > 1) source.warnings.push(`${relation} selector matches ${hits.length} objects`);
    for (const h of hits) ref(source, h.kind, h.name, relation, undefined, h.namespace, true);
  };

  for (const n of nodes) {
    const o = n.manifest!.obj; const s = o.spec ?? {};
    switch (o.kind) {
      case 'Service': bySelector(n, s.selector ? { matchLabels: s.selector } : undefined, 'selects', null, false); break;
      case 'StatefulSet': ref(n, 'Service', s.serviceName, 'governed-by'); break;
      case 'Ingress':
        for (const r of s.rules ?? []) for (const p of r.http?.paths ?? []) ref(n, 'Service', p.backend?.service?.name, 'routes-to', p.path);
        ref(n, 'Service', s.defaultBackend?.service?.name, 'routes-to', 'default');
        for (const t of s.tls ?? []) ref(n, 'Secret', t.secretName, 'tls-from');
        break;
      case 'HTTPRoute':
        for (const r of s.rules ?? []) for (const b of r.backendRefs ?? []) ref(n, b.kind ?? 'Service', b.name, 'routes-to', b.port ? String(b.port) : undefined, b.namespace ?? n.namespace);
        for (const p of s.parentRefs ?? []) ref(n, p.kind ?? 'Gateway', p.name, 'attaches-to', undefined, p.namespace ?? n.namespace);
        break;
      case 'Certificate':
        ref(n, 'Secret', s.secretName, 'produces');
        if (s.issuerRef?.name) ref(n, s.issuerRef.kind ?? 'Issuer', s.issuerRef.name, 'issued-by');
        break;
      case 'ServiceMonitor': bySelector(n, s.selector, 'scrapes', 'Service', true); break;
      case 'PodDisruptionBudget': bySelector(n, s.selector, 'protects', null, false); break;
      case 'NetworkPolicy': bySelector(n, s.podSelector, 'guards', null, false); break;
      case 'HorizontalPodAutoscaler': ref(n, s.scaleTargetRef?.kind ?? 'Deployment', s.scaleTargetRef?.name, 'scales'); break;
      case 'RoleBinding':
        ref(n, o.roleRef?.kind ?? 'Role', o.roleRef?.name, 'binds');
        for (const sub of o.subjects ?? []) ref(n, sub.kind ?? 'ServiceAccount', sub.name, 'binds', undefined, sub.namespace ?? n.namespace);
        break;
      case 'ServiceAccount': for (const p of o.imagePullSecrets ?? []) ref(n, 'Secret', p.name, 'pulls-with'); break;
    }
    const pt = podTemplateOf(o);
    if (pt) {
      const ps = pt.spec ?? {};
      ref(n, 'ServiceAccount', ps.serviceAccountName, 'runs-as');
      for (const v of ps.volumes ?? []) {
        ref(n, 'ConfigMap', v.configMap?.name, 'mounts', v.name);
        ref(n, 'Secret', v.secret?.secretName, 'mounts', v.name);
        ref(n, 'PersistentVolumeClaim', v.persistentVolumeClaim?.claimName, 'mounts', v.name);
        for (const src of v.projected?.sources ?? []) { ref(n, 'ConfigMap', src.configMap?.name, 'mounts', v.name); ref(n, 'Secret', src.secret?.name, 'mounts', v.name); }
        ref(n, 'Secret', v.csi?.nodePublishSecretRef?.name, 'mounts', v.name);
      }
      for (const c of [...(ps.initContainers ?? []), ...(ps.containers ?? [])]) {
        for (const e of c.envFrom ?? []) { ref(n, 'ConfigMap', e.configMapRef?.name, 'reads'); ref(n, 'Secret', e.secretRef?.name, 'reads'); }
        for (const e of c.env ?? []) { ref(n, 'ConfigMap', e.valueFrom?.configMapKeyRef?.name, 'reads', e.name); ref(n, 'Secret', e.valueFrom?.secretKeyRef?.name, 'reads', e.name); }
      }
      for (const p of ps.imagePullSecrets ?? []) ref(n, 'Secret', p.name, 'pulls-with');
    }
    if (o.kind === 'Job' && n.provenance?.path.at(-1) === 'migrations' && n.provenance.owner) {
      ref(n, 'Deployment', String(n.provenance.owner[1]), 'precedes');
    }
  }
  return refs;
}
