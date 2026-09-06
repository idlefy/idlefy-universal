import type { Manifest } from '../engine/types';
import type { GraphEdge, GraphModel, GraphNode } from './types';
import { familyOf, resourceKey } from './labels';
import { buildExpectations } from './expectations';
import { attachProvenance } from './provenance';
import { extractRefs } from './edges';

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
  for (const r of extractRefs(rendered, ns)) {
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
  const seen = new Set<string>();
  return { nodes, edges: edges.filter((e) => !seen.has(e.id) && seen.add(e.id)), warnings };
}
