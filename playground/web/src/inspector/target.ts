import type { GraphNode } from '../graph/types';
import type { ValuesPath } from '../model/ValuesDocument';
import { schemaAt, type SchemaNode } from './schema';
import { SECONDARY, type SecondaryId } from '../graph/secondary';

export type InspectTarget =
  | { kind: 'workload'; kindKey: string; name: string; path: ValuesPath }
  | { kind: 'entity'; path: ValuesPath }
  // auto-created resource whose values block has no schema node — in practice only the auto-created
  // Service (…/service). Role/RoleBinding (…/rbac), the migrations Job (…/migrations), Ingress, PDB,
  // HPA etc. all have schema nodes and open as 'entity'.
  | { kind: 'owner-only'; owner: ValuesPath; secondary: SecondaryId }
  | { kind: 'release' }
  | { kind: 'none'; reason: string };

const WORKLOAD_KEYS = new Set(['deployments', 'statefulSets', 'daemonSets', 'jobs', 'cronJobs']);
// provenance path tail → secondary id (the tail names the values block; 'service' has no schema node)
const TAIL_TO_SECONDARY: Record<string, SecondaryId> = { service: 'service', ingress: 'ingress', httpRoute: 'httpRoute', certificate: 'certificate', hpa: 'hpa', migrations: 'migrations', pdb: 'pdb', serviceMonitor: 'serviceMonitor', networkPolicy: 'networkPolicy', rbac: 'rbac', serviceAccount: 'serviceAccount' };

/** Where the inspector opens for a graph node: its own values entry, its owner's, or nowhere. */
export function inspectTarget(node: GraphNode, root: SchemaNode): InspectTarget {
  if (node.kind === 'Release') return { kind: 'release' };
  if (node.external) return { kind: 'none', reason: `${node.kind}/${node.name} is not created by this release.` };
  const p = node.provenance;
  if (!p) return { kind: 'none', reason: 'This object is not produced by a known values path.' };
  if (p.path.length === 2 && WORKLOAD_KEYS.has(String(p.path[0]))) return { kind: 'workload', kindKey: String(p.path[0]), name: String(p.path[1]), path: p.path };
  if (p.owner && p.path.length === 3) {
    const tail = String(p.path[2]);
    const sec = TAIL_TO_SECONDARY[tail];
    if (sec && !schemaAt(root, p.path)) return { kind: 'owner-only', owner: p.owner, secondary: sec };
  }
  if (schemaAt(root, p.path)) return { kind: 'entity', path: p.path };
  return { kind: 'none', reason: `No schema node for values path ${p.path.join('.')}.` };
}

export const secondaryById = (id: SecondaryId) => SECONDARY.find((s) => s.id === id)!;
