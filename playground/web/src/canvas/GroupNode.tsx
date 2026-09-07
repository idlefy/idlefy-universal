import type { NodeProps, Node } from '@xyflow/react';
import type { GroupNodeData } from './layout';

/** Purely decorative container: the workload plus the resources the chart auto-creates for it. */
export function GroupNode({ data }: NodeProps<Node<GroupNodeData>>) {
  return (
    <div className="rgroup">
      <span className="rgroup-label">{data.label}</span>
    </div>
  );
}
