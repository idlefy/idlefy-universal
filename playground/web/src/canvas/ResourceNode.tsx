import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { ResourceNodeData } from './layout';
import { KindIcon } from './icons';

export function ResourceNode({ data }: NodeProps<Node<ResourceNodeData>>) {
  const { node, dimmed } = data;
  const cls = ['rnode', `fam-${node.family}`, node.external && 'external', node.conflict && 'conflict', dimmed && 'dimmed'].filter(Boolean).join(' ');
  return (
    <div className={cls} title={node.warnings.join('\n')}>
      <Handle type="target" position={Position.Left} />
      <KindIcon kind={node.kind} />
      <span className="rnode-text">
        <span className="rnode-kind">
          {node.kind}
          {node.hookBadge && <em className="badge">hook</em>}
          {node.warnings.length > 0 && <em className="badge warn">!</em>}
        </span>
        <span className="rnode-name">{node.name}</span>
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
