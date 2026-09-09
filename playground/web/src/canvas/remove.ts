import type { EditOp } from '../model/ValuesDocument';
import type { GraphNode } from '../graph/types';
import type { ResolvedSelection } from '../app/selection';
import { plural } from '../inspector/summary';

export type Removal = { ops: EditOp[]; label: string; title: string };
export const REMOVE_HINT = ' · Ctrl+Z in the editor restores';

/**
 * Spec §6: removable = a node (or a group whose owner is such a node) with provenance, no owner,
 * a non-empty removeAction and not external. Every auto-created node has a non-empty removeAction
 * (its flag-off ops) *and* an owner; the `!owner` test is what excludes them — the group panel's
 * switch list is the one place to turn those off.
 */
const removable = (n: GraphNode): boolean => !!n.provenance && !n.provenance.owner && n.provenance.removeAction.length > 0 && !n.external;

export function removalOf(sel: ResolvedSelection): Removal | null {
  if (sel.kind === 'block') return null;
  const node = sel.kind === 'group' ? sel.group.owner : sel.node;
  if (!removable(node)) return null;
  const label = `Remove ${node.kind} ${node.name}`;
  const n = sel.kind === 'group' ? sel.group.members.length : 0;
  const suffix = n > 0 ? ` and its ${plural(n, 'rendered resource')}` : '';
  return { ops: node.provenance!.removeAction, label, title: `${label}${suffix}${REMOVE_HINT}` };
}
