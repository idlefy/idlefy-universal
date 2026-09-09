import { isObj } from '../../model/guards';
import { useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { FieldList } from './index';
import { AddKeyRow } from './AddKeyRow';
import { resolve, type SchemaNode } from '../schema';
import { starterValue } from '../form';

export function MapSection({ root, field, tier, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const r = resolve(root, field.schema);
  const item = r.additionalProperties as SchemaNode;
  const keyPattern = (field.widget as { keyPattern?: string }).keyPattern;
  const entries = isObj(field.value) ? Object.keys(field.value) : [];
  const [open, setOpen] = useState<Record<string, boolean>>({});
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
      <AddKeyRow id={id} existing={entries} valid={(k) => !keyPattern || new RegExp(keyPattern).test(k)} invalidText={`must match ${keyPattern}`} placeholder="new name"
        onAdd={(k) => onEdit([{ op: 'set', path: [...field.path, k], value: starterValue(root, item) }])} />
    </div>
  );
}
