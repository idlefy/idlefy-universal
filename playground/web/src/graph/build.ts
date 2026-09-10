import type { Manifest } from '../engine/types';
import type { GraphEdge, GraphModel, GraphNode, EdgeRelation } from './types';
import { familyOf, resourceKey } from './labels';
import { buildExpectations } from './expectations';
import { attachProvenance } from './provenance';
import { extractRefs } from './edges';

// An auto-created Ingress/HTTPRoute/ServiceMonitor is generated *for* a workload, so its backend is
// not a user-chosen placeholder: if every candidate resolves to an external node, the chart rendered
// a reference to nothing and said "ok". Warn on the node (a badge + the detail panel), not in the
// banner — this is a property of one resource, not of the release.
const BACKED_BY_SERVICE: Partial<Record<string, EdgeRelation>> = { Ingress: 'routes-to', HTTPRoute: 'routes-to', ServiceMonitor: 'scrapes' };
const MISSING_BACKEND = 'no Service in this release backs it';

export function buildGraph(manifests: Manifest[], values: any, ns: string): GraphModel {
  const warnings: string[] = [];
  const { byManifest: prov, unconsumed } = attachProvenance(manifests, buildExpectations(values, ns), ns);
  for (const e of unconsumed) warnings.push(`${e.kind}/${e.name}: expected from values path ${e.provenance.path.join('.')} but not rendered`);

  const nodes: GraphNode[] = [{
    id: 'release', key: 'release', kind: 'Release', name: 'settings', namespace: ns, family: 'config',
    external: false, conflict: false, hookBadge: false, warnings: [],
    provenance: { path: [], governingCondition: 'always', removeAction: [] },
  }];
  const byKey = new Map<string, GraphNode[]>();
  const ordered = [...manifests].sort((a, b) => a.templatePath.localeCompare(b.templatePath) || a.docIndex - b.docIndex);
  for (const m of ordered) {
    const nsOf = m.obj.metadata.namespace ?? ns;
    const key = resourceKey(nsOf, m.obj.kind, m.obj.metadata.name);
    const siblings = byKey.get(key) ?? [];
    const p = prov.get(m);
    const node: GraphNode = {
      id: siblings.length ? `${key}#${siblings.length + 1}` : key, key,
      kind: m.obj.kind, name: m.obj.metadata.name, namespace: nsOf, family: familyOf(m.obj.kind),
      external: false, conflict: false, hookBadge: m.obj.kind === 'Job' && p?.path.at(-1) === 'migrations' && !!p.owner, manifest: m, provenance: p, warnings: [],
    };
    if (!p) node.warnings.push('no provenance: not produced by a known values path');
    siblings.push(node); byKey.set(key, siblings); nodes.push(node);
  }
  for (const [key, list] of byKey) if (list.length > 1) {
    const message = `${key.split('/').slice(1).join('/')}: ${list.length} objects share this name; helm would apply both`;
    for (const n of list) { n.conflict = true; n.warnings.push(message); }
    warnings.push(message);
  }

  const edges: GraphEdge[] = [];
  const externals = new Map<string, GraphNode>();
  const rendered = nodes.filter((n) => n.manifest);
  for (const r of extractRefs(rendered)) {
    let target = byKey.get(r.targetKey)?.[0];
    if (!target) {
      target = externals.get(r.targetKey);
      if (!target) {
        target = { id: r.targetKey, key: r.targetKey, kind: r.targetKind, name: r.targetName, namespace: r.targetNs,
          family: r.bySelector ? 'external' : familyOf(r.targetKind), external: true, conflict: false, hookBadge: false, warnings: [] };
        externals.set(r.targetKey, target); nodes.push(target);
      }
    }
    edges.push({ id: `${r.source.id}|${r.relation}|${target.id}|${r.label ?? ''}`, source: r.source.id, target: target.id, relation: r.relation, label: r.label });
    // A Secret produced by a Certificate is created at runtime by cert-manager: part of the release, not external.
    if (r.relation === 'produces') { target.external = false; target.family = 'config'; }
  }
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  for (const n of nodes) {
    const relation = n.provenance?.owner ? BACKED_BY_SERVICE[n.kind] : undefined;
    if (!relation) continue;
    // An HTTPRoute backendRef can deliberately name a foreign namespace or a non-Service kind
    // (Gateway API's cross-namespace/custom-backend support); the graph only holds release-namespace
    // nodes, so such a ref always resolves to `external` regardless of whether the user meant it.
    // Every node built for a ref (extractRefs' targetKind/targetNs, carried onto both resolved and
    // external nodes) records its real kind and namespace, so restrict candidates to same-namespace
    // Services before judging whether the route/monitor actually lost its backend.
    const backends = edges
      .filter((e) => e.source === n.id && e.relation === relation)
      .filter((e) => { const t = byId.get(e.target); return t?.kind === 'Service' && t?.namespace === n.namespace; });
    if (backends.length > 0 && backends.every((e) => byId.get(e.target)?.external)) n.warnings.push(MISSING_BACKEND);
  }
  const seen = new Set<string>();
  return { nodes, edges: edges.filter((e) => !seen.has(e.id) && seen.add(e.id)), warnings };
}
