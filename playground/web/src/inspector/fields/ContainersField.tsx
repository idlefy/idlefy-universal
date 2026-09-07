import { useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { FieldList } from './index';
import { resolve, type SchemaNode } from '../schema';
import { starterValue } from '../form';
import { ImageField } from './ImageField';

/** One card per container: image:tag row, the remaining present fields, chips for the rest; add row below. */
export function ContainersField({ root, field, tier, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const item = resolve(root, field.schema).additionalProperties as SchemaNode;
  // `containers` has no propertyNames pattern in the schema, so fall back to Kubernetes container-name rules.
  const NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  const pattern = (field.widget as { keyPattern?: string }).keyPattern ?? NAME.source;
  const containers = (field.value && typeof field.value === 'object' ? field.value : {}) as Record<string, Record<string, unknown>>;
  const names = Object.keys(containers);
  const [draft, setDraft] = useState('');
  const k = draft.trim();
  const bad = k !== '' && (!new RegExp(pattern).test(k) || names.includes(k));
  return (
    <div className="containers">
      {names.map((n) => {
        const base = [...field.path, n];
        const c = containers[n] ?? {};
        return (
          <div className="card" key={n}>
            <h4><code>{n}</code><button type="button" className="clear" aria-label={`remove ${id}.${n}`} title="Remove this container" onClick={() => onEdit([{ op: 'delete', path: base }])}>remove</button></h4>
            <ImageField base={base} image={c.image as string | undefined} imageTag={c.imageTag as string | undefined} onEdit={onEdit} />
            <FieldList root={root} node={item} basePath={base} value={c} tier={tier} onEdit={onEdit} hide={(x) => x === 'image' || x === 'imageTag'} />
          </div>
        );
      })}
      <div className="kv-row add">
        <input type="text" aria-label={`new key ${id}`} placeholder="new container name" value={draft} className={bad ? 'invalid' : ''} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" className="btn small" aria-label={`add ${id}`} disabled={k === '' || bad}
          onClick={() => { onEdit([{ op: 'set', path: [...field.path, k], value: starterValue(root, item) }]); setDraft(''); }}>+ container</button>
        {bad && <span className="field-err">{names.includes(k) ? 'already exists' : 'lowercase letters, digits and dashes'}</span>}
      </div>
    </div>
  );
}
