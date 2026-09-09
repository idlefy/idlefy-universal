import { useContext } from 'react';
import type { NodeProps, Node } from '@xyflow/react';
import type { GroupNodeData } from './layout';
import { CanvasActions } from './actions';
import { GroupGlyph } from './icons';

/** The workload plus the resources the chart auto-creates for it; selectable as an entity. */
export function GroupNode({ id, data, selected }: NodeProps<Node<GroupNodeData>>) {
  const { select, addResource } = useContext(CanvasActions);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className={`rgroup ${selected ? 'selected' : ''}`}>
      <div className="area-head">
        <button type="button" className="area-title nodrag nopan" aria-label={`Open group ${data.kind} ${data.name}`} onClick={(e) => { stop(e); select(id); }}>
          <GroupGlyph className="ai" />
          <span>{data.kind} <b>{data.name}</b></span>
        </button>
        <button type="button" className="area-add nodrag nopan" aria-label={`Add resource to ${data.kind} ${data.name}`} onClick={(e) => { stop(e); addResource(id); }}>+ Add resource</button>
      </div>
    </div>
  );
}
