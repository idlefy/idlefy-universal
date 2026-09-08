import type { ReactElement } from 'react';
import type { EditOp, ValuesPath } from '../../model/ValuesDocument';

/** `image` and `imageTag` on one row: `nginx : 1.27`. Empty tag deletes the key (chart requires it, so the row shows a required mark). */
export function ImageField({ base, image, imageTag, onEdit }: { base: ValuesPath; image?: string; imageTag?: string; onEdit: (ops: EditOp[]) => void }): ReactElement {
  const id = base.join('.');
  const emit = (key: 'image' | 'imageTag', t: string) => onEdit([t === '' ? { op: 'delete', path: [...base, key] } : { op: 'set', path: [...base, key], value: t }]);
  return (
    <div className="field inline">
      <div className="field-head"><label htmlFor={`${id}.image`} data-key="image" title={`${id}.image`}>Image<span className="req" title="required">*</span></label></div>
      <div className="two">
        <input id={`${id}.image`} type="text" aria-label={`${id}.image`} value={image ?? ''} placeholder="repository/name" onChange={(e) => emit('image', e.target.value)} />
        <span>:</span>
        <input type="text" aria-label={`${id}.imageTag`} value={imageTag ?? ''} placeholder="tag" onChange={(e) => emit('imageTag', e.target.value)} />
      </div>
    </div>
  );
}
