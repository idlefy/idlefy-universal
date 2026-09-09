import { isObj } from '../../model/guards';
import { useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { resolve, type SchemaNode } from '../schema';
import { itemLabelOf, starterValue } from '../form';
import { plural } from '../summary';
import { ObjectListField } from './ObjectListField';
import { YamlField } from './YamlField';

/** A map whose values are object lists — today only `secretRefs` (spec 2026-09-08 §5.3): one card per key. */
export function MapOfListsField({ root, field, tier, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const r = resolve(root, field.schema);
  const listNode = r.additionalProperties as SchemaNode;
  const keyPattern = typeof r.propertyNames?.pattern === 'string' ? r.propertyNames.pattern : undefined;
  const entries = isObj(field.value) ? Object.entries(field.value) : [];
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const k = newKey.trim();
  const keyBad = k !== '' && ((!!keyPattern && !new RegExp(keyPattern).test(k)) || entries.some(([e]) => e === k));
  const label = itemLabelOf(field.key);
  return (
    <div className="mol">
      {entries.map(([key, v]) => {
        const items = Array.isArray(v) ? v : [];
        // `tier` on a Field means its x-ui-tier; the list itself is always shown once its key exists
        const sub = { key, path: [...field.path, key], label: key, widget: { kind: 'objectList' as const }, schema: listNode, value: v, present: true, required: false, tier: 'basic' as const };
        return (
          <div className="card" key={key}>
            <h4><code>{key}</code><span className="muted">{plural(items.length, label.toLowerCase())}</span>
              <button type="button" className="clear" aria-label={`remove ${id}.${key}`} title="Remove this group" onClick={() => onEdit([{ op: 'delete', path: [...field.path, key] }])}>×</button></h4>
            <div className="card-body">{Array.isArray(v) ? <ObjectListField root={root} field={sub} tier={tier} onEdit={onEdit} itemLabel={label} /> : <YamlField root={root} field={sub} tier={tier} onEdit={onEdit} />}</div>
          </div>
        );
      })}
      {adding ? (
        <div className="kv-row add">
          <input type="text" aria-label={`new key ${id}`} placeholder="group name" value={newKey} className={keyBad ? 'invalid' : ''} onChange={(e) => setNewKey(e.target.value)} />
          <button type="button" aria-label={`add ${id}`} disabled={k === '' || keyBad}
            onClick={() => { onEdit([{ op: 'set', path: [...field.path, k], value: [starterValue(root, resolve(root, listNode).items)] }]); setNewKey(''); setAdding(false); }}>add</button>
          {keyBad && <span className="field-err">{entries.some(([e]) => e === k) ? 'already exists' : `must match ${keyPattern}`}</span>}
        </div>
      ) : (
        <div className="add"><button type="button" className="chip" aria-label={`add group ${id}`} onClick={() => setAdding(true)}>Group</button></div>
      )}
    </div>
  );
}
