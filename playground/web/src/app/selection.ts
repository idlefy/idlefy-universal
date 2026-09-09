import type { GraphModel, GraphNode } from '../graph/types';
import type { ValuesPath } from '../model/ValuesDocument';
import { groupsOf, isWorkloadNode, type Group } from '../graph/groups';
import { kindOfSecondary } from '../inspector/summary';
import type { SecondaryId } from '../graph/secondary';

/** A selection is a node id, `group:<workloadNodeId>` or `block:<kindKey>.<name>.<block>`. */
export type ResolvedSelection =
  | { kind: 'node'; node: GraphNode }
  | { kind: 'group'; group: Group }
  | { kind: 'block'; path: ValuesPath; owner: GraphNode };

const GROUP = 'group:', BLOCK = 'block:';
export const groupId = (workloadNodeId: string): string => `${GROUP}${workloadNodeId}`;
export const blockId = (path: ValuesPath): string => `${BLOCK}${path.join('.')}`;
export const isGroupId = (s: string): boolean => s.startsWith(GROUP);
export const isBlockId = (s: string): boolean => s.startsWith(BLOCK);

// Block paths are `<kindKey>.<name>.<block>`; workload names in this chart are DNS labels (no dots).
const blockPath = (s: string): ValuesPath | null => { const p = s.slice(BLOCK.length).split('.'); return p.length === 3 && p.every(Boolean) ? p : null; };
const workloadAt = (graph: GraphModel, kindKey: string, name: string): GraphNode | null =>
  graph.nodes.find((n) => isWorkloadNode(n) && n.provenance!.path[0] === kindKey && n.provenance!.path[1] === name) ?? null;

/** The node a selection is anchored to: itself, or the workload that owns the group/block. Null when it no longer exists. */
export function anchorOf(graph: GraphModel, selection: string): GraphNode | null {
  if (isGroupId(selection)) return graph.nodes.find((n) => n.id === selection.slice(GROUP.length)) ?? null;
  if (isBlockId(selection)) { const p = blockPath(selection); return p ? workloadAt(graph, String(p[0]), String(p[1])) : null; }
  return graph.nodes.find((n) => n.id === selection) ?? null;
}

export function resolveSelection(graph: GraphModel | null, selection: string | null): ResolvedSelection | null {
  if (!graph || !selection) return null;
  if (isGroupId(selection)) { const group = groupsOf(graph).find((g) => g.id === selection); return group ? { kind: 'group', group } : null; }
  if (isBlockId(selection)) { const path = blockPath(selection); const owner = anchorOf(graph, selection); return path && owner ? { kind: 'block', path, owner } : null; }
  const node = graph.nodes.find((n) => n.id === selection);
  return node ? { kind: 'node', node } : null;
}

/** Name and kind for headers and the collapsed-inspector rail. */
export function titleOf(sel: ResolvedSelection): { name: string; kind: string } {
  if (sel.kind === 'node') return { name: sel.node.name, kind: sel.node.kind };
  if (sel.kind === 'group') return { name: sel.group.owner.name, kind: `${sel.group.owner.kind} group` };
  return { name: sel.owner.name, kind: kindOfSecondary(String(sel.path[2]) as SecondaryId) };
}
