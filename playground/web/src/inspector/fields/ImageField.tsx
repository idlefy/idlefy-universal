import { useEffect, useState, type ReactElement } from 'react';
import type { EditOp, ValuesPath } from '../../model/ValuesDocument';

/** `image` and `imageTag` on one row: `nginx : 1.27`. Both are `ContainerSpec.required`, so an
 *  emptied box is held locally (shown empty and invalid) and nothing is emitted — deleting the key
 *  made the document unrenderable on the first backspace. */
export function ImageField({ base, image, imageTag, onEdit }: { base: ValuesPath; image?: string; imageTag?: string; onEdit: (ops: EditOp[]) => void }): ReactElement {
  const id = base.join('.');
  const [drafts, setDrafts] = useState<{ image?: string; imageTag?: string }>({});
  // any pending text is stale once the committed value moves (a YAML-pane edit, another container)
  useEffect(() => { setDrafts({}); }, [image, imageTag]);
  const emit = (key: 'image' | 'imageTag', t: string) => {
    if (t === '') { setDrafts((d) => ({ ...d, [key]: '' })); return; }
    setDrafts((d) => ({ ...d, [key]: undefined }));
    onEdit([{ op: 'set', path: [...base, key], value: t }]);
  };
  const box = (key: 'image' | 'imageTag', committed: string | undefined, placeholder: string, withId: boolean) => {
    const draft = drafts[key];
    const value = draft ?? committed ?? '';
    const bad = draft === '';
    return (
      <input {...(withId ? { id: `${id}.image` } : {})} type="text" aria-label={`${id}.${key}`} value={value} placeholder={placeholder}
        className={bad ? 'invalid' : ''} onChange={(e) => emit(key, e.target.value)} />
    );
  };
  return (
    <div className="field">
      <div className="field-head"><label htmlFor={`${id}.image`} data-key="image" title={`${id}.image`}>Image<span className="req" title="required">*</span></label></div>
      <div className="two">
        {box('image', image, 'repository/name', true)}
        <span>:</span>
        {box('imageTag', imageTag, 'tag', false)}
      </div>
    </div>
  );
}
