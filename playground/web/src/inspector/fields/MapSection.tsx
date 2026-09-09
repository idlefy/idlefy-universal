import { isObj } from '../../model/guards';
import { useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { FieldList } from './index';
import { resolve, type SchemaNode } from '../schema';
import { starterValue } from '../form';

export function MapSection({ root, field, tier, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const r = resolve(root, field.schema);
  const item = r.additionalProperties as SchemaNode;
  const keyPattern = (field.widget as { keyPattern?: string }).keyPattern;
  const entries = isObj(field.value) ? Object.keys(field.value) : [];
  const [newKey, setNewKey] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const k = newKey.trim();
  const keyBad = k !== '' && ((!!keyPattern && !new RegExp(keyPattern).test(k)) || entries.includes(k));
  return (
    <div className="map">
      {entries.map((key) => (
        <details key={key} open={open[key] ?? entries.length <= 2} onToggle={(e) => setOpen({ ...open, [key]: (e.target as HTMLDetailsElement).open })}>
          <summary><span>{key}</span>
            <button type="button" aria-label={`remove ${id}.${key}`} onClick={(e) => { e.preventDefault(); onEdit([{ op: 'delete', path: [...field.path, key] }]); }}>×</button>
          </summary>
          <FieldList root={root} node={item} basePath={[...field.path, key]} value={(field.value as Record<string, unknown>)[key]} tier={tier} onEdit={onEdit} />
        </details>
      ))}
      <div className="kv-row add">
        <input type="text" aria-label={`new key ${id}`} placeholder="new name" value={newKey} className={keyBad ? 'invalid' : ''} onChange={(e) => setNewKey(e.target.value)} />
        <button type="button" aria-label={`add ${id}`} disabled={k === '' || keyBad}
          onClick={() => { onEdit([{ op: 'set', path: [...field.path, k], value: starterValue(root, item) }]); setNewKey(''); }}>add</button>
        {keyBad && <span className="field-err">{entries.includes(k) ? 'already exists' : `must match ${keyPattern}`}</span>}
      </div>
    </div>
  );
}
