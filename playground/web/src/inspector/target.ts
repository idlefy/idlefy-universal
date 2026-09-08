import type { GraphNode } from '../graph/types';
import type { ValuesPath } from '../model/ValuesDocument';
import type { ResolvedSelection } from '../app/selection';
import { schemaAt, type SchemaNode } from './schema';
import { SECONDARY, type SecondaryId } from '../graph/secondary';
import { WORKLOAD_KEYS } from '../canvas/groups';

export type InspectTarget =
  | { kind: 'group'; owner: GraphNode; members: GraphNode[] }
  | { kind: 'workload'; kindKey: string; name: string; path: ValuesPath }
  // an auto-created resource: its values block (`…/ingress`), the owning workload, and the graph node when one is rendered
  | { kind: 'secondary'; owner: ValuesPath; secondary: SecondaryId; path: ValuesPath; node: GraphNode | null }
  | { kind: 'entity'; path: ValuesPath }
  | { kind: 'release' }
  | { kind: 'none'; reason: string };

// provenance path tail → secondary id (the tail names the values block; 'service' has no schema node)
export const TAIL_TO_SECONDARY: Record<string, SecondaryId> = { service: 'service', ingress: 'ingress', httpRoute: 'httpRoute', certificate: 'certificate', hpa: 'hpa', migrations: 'migrations', pdb: 'pdb', serviceMonitor: 'serviceMonitor', networkPolicy: 'networkPolicy', rbac: 'rbac', serviceAccount: 'serviceAccount' };

/** Which panel a selection opens (spec 2026-09-08 §3). */
export function inspectTarget(sel: ResolvedSelection, root: SchemaNode): InspectTarget {
  if (sel.kind === 'group') return { kind: 'group', owner: sel.group.owner, members: sel.group.members };
  if (sel.kind === 'block') {
    const secondary = TAIL_TO_SECONDARY[String(sel.path[2])];
    if (!secondary) return { kind: 'none', reason: `${sel.path.join('.')} is not an auto-created resource block.` };
    return { kind: 'secondary', owner: sel.path.slice(0, 2), secondary, path: sel.path, node: null };
  }
  const node = sel.node;
  if (node.kind === 'Release') return { kind: 'release' };
  if (node.external) return { kind: 'none', reason: `${node.kind}/${node.name} is not created by this release.` };
  const p = node.provenance;
  if (!p) return { kind: 'none', reason: 'This object is not produced by a known values path.' };
  if (p.path.length === 2 && WORKLOAD_KEYS.has(String(p.path[0]))) return { kind: 'workload', kindKey: String(p.path[0]), name: String(p.path[1]), path: p.path };
  if (p.owner && p.path.length === 3) {
    const secondary = TAIL_TO_SECONDARY[String(p.path[2])];
    if (secondary) return { kind: 'secondary', owner: p.owner, secondary, path: p.path, node };
  }
  if (schemaAt(root, p.path)) return { kind: 'entity', path: p.path };
  return { kind: 'none', reason: `No schema node for values path ${p.path.join('.')}.` };
}

export const secondaryById = (id: SecondaryId) => SECONDARY.find((s) => s.id === id)!;
