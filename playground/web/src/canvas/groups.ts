import type { GraphModel, GraphNode } from '../graph/types';

export type Group = { id: string; owner: GraphNode; members: GraphNode[] };
const same = (a: (string | number)[] | undefined, b: (string | number)[] | undefined) =>
  !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

/** One group per workload node that owns at least one other rendered node (provenance.owner === workload path). */
export function groupsOf(model: GraphModel): Group[] {
  const workloads = model.nodes.filter((n) => n.manifest && n.provenance && n.provenance.path.length === 2 && !n.provenance.owner);
  const out: Group[] = [];
  for (const w of workloads) {
    const members = model.nodes.filter((n) => n !== w && n.provenance?.owner && same(n.provenance.owner, w.provenance!.path));
    if (members.length) out.push({ id: `group:${w.id}`, owner: w, members });
  }
  return out;
}
