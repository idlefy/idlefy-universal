import type { GraphNode } from '../graph/types';
import type { ValuesPath } from '../model/ValuesDocument';
import type { ResolvedSelection } from '../app/selection';
import { schemaAt, type SchemaNode } from './schema';
import { SEC_IDS, WORKLOAD_KEYS, type SecondaryId } from '../graph/secondary';

export type InspectTarget =
  | { kind: 'group'; owner: GraphNode; members: GraphNode[] }
  | { kind: 'workload'; name: string; path: ValuesPath }
  // an auto-created resource: its values block (`…/ingress`) and the owning workload
  | { kind: 'secondary'; owner: ValuesPath; secondary: SecondaryId; path: ValuesPath }
  | { kind: 'entity'; path: ValuesPath; owner?: ValuesPath }
  | { kind: 'release' }
  | { kind: 'none'; reason: string };

/** Which panel a selection opens. */
export function inspectTarget(sel: ResolvedSelection, root: SchemaNode): InspectTarget {
  if (sel.kind === 'group') return { kind: 'group', owner: sel.group.owner, members: sel.group.members };
  if (sel.kind === 'block') {
    const tail = String(sel.path[2]);
    if (!SEC_IDS.has(tail)) return { kind: 'none', reason: `${sel.path.join('.')} is not an auto-created resource block.` };
    return { kind: 'secondary', owner: sel.path.slice(0, 2), secondary: tail as SecondaryId, path: sel.path };
  }
  const node = sel.node;
  if (node.kind === 'Release') return { kind: 'release' };
  if (node.external) return { kind: 'none', reason: `${node.kind}/${node.name} is not created by this release.` };
  const p = node.provenance;
  if (!p) return { kind: 'none', reason: 'This object is not produced by a known values path.' };
  if (p.path.length === 2 && WORKLOAD_KEYS.has(String(p.path[0]))) return { kind: 'workload', name: String(p.path[1]), path: p.path };
  if (p.owner && p.path.length === 3) {
    const tail = String(p.path[2]);
    if (SEC_IDS.has(tail)) return { kind: 'secondary', owner: p.owner, secondary: tail as SecondaryId, path: p.path };
  }
  if (schemaAt(root, p.path)) return { kind: 'entity', path: p.path, owner: p.owner };
  return { kind: 'none', reason: `No schema node for values path ${p.path.join('.')}.` };
}
