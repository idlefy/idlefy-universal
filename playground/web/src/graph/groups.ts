import type { GraphModel, GraphNode } from './types';
import { samePath } from '../model/guards';
import { WORKLOAD_KEYS } from './secondary';

export type Group = { id: string; owner: GraphNode; members: GraphNode[] };

export const isWorkloadNode = (n: GraphNode): boolean =>
  !!n.manifest && !!n.provenance && n.provenance.path.length === 2 && !n.provenance.owner && WORKLOAD_KEYS.has(String(n.provenance.path[0]));

/** One group per workload node, members = every rendered node whose provenance.owner is the workload's path. A lone workload still gets a group. */
export function groupsOf(model: GraphModel): Group[] {
  return model.nodes.filter(isWorkloadNode).map((w) => ({
    id: `group:${w.id}`,
    owner: w,
    members: model.nodes.filter((n) => n !== w && n.provenance?.owner && samePath(n.provenance.owner, w.provenance!.path)),
  }));
}
