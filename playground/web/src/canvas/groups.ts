import type { GraphModel, GraphNode } from '../graph/types';

export type Group = { id: string; owner: GraphNode; members: GraphNode[] };
/** values.yaml maps whose entries are workloads (spec 2026-09-08 §2.1). */
export const WORKLOAD_KEYS: ReadonlySet<string> = new Set(['deployments', 'statefulSets', 'daemonSets', 'jobs', 'cronJobs']);
const same = (a: (string | number)[] | undefined, b: (string | number)[] | undefined) =>
  !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

export const isWorkloadNode = (n: GraphNode): boolean =>
  !!n.manifest && !!n.provenance && n.provenance.path.length === 2 && !n.provenance.owner && WORKLOAD_KEYS.has(String(n.provenance.path[0]));

/** One group per workload node, members = every rendered node whose provenance.owner is the workload's path. A lone workload still gets a group. */
export function groupsOf(model: GraphModel): Group[] {
  return model.nodes.filter(isWorkloadNode).map((w) => ({
    id: `group:${w.id}`,
    owner: w,
    members: model.nodes.filter((n) => n !== w && n.provenance?.owner && same(n.provenance.owner, w.provenance!.path)),
  }));
}
