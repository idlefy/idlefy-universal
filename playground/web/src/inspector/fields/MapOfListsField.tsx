import { isObj } from '../../model/guards';
import { useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { AddKeyRow } from './AddKeyRow';
import { Card } from './Card';
import { resolve, type SchemaNode } from '../schema';
import { itemLabelOf, makeField, starterValue } from '../form';
import { plural } from '../summary';
import { ObjectListField } from './ObjectListField';
import { YamlField } from './YamlField';

/** A map whose values are object lists — today only `secretRefs`: one card per key. */
export function MapOfListsField({ root, field, tier, onEdit, blockedRemove }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const r = resolve(root, field.schema);
  const listNode = r.additionalProperties as SchemaNode;
  const keyPattern = typeof r.propertyNames?.pattern === 'string' ? r.propertyNames.pattern : undefined;
  const entries = isObj(field.value) ? Object.entries(field.value) : [];
  const [adding, setAdding] = useState(false);
  const label = itemLabelOf(field.key);
  return (
    <div className="mol">
      {entries.map(([key, v]) => {
        const items = Array.isArray(v) ? v : [];
        // `tier` on a Field means its x-ui-tier; the list itself is always shown once its key exists
        const sub = makeField(root, key, [...field.path, key], listNode, v, { present: true, tier: 'basic' });
        const why = blockedRemove?.(key);
        return (
          <Card key={key} code={key} aside={<span className="muted">{plural(items.length, label.toLowerCase())}</span>}
            removeLabel={`remove ${id}.${key}`} removeDisabled={!!why}
            removeTitle={why ?? 'Remove this group'} removeText="×"
            onRemove={() => { if (!why) onEdit([{ op: 'delete', path: [...field.path, key] }]); }}>
            <div className="card-body">{Array.isArray(v) ? <ObjectListField root={root} field={sub} tier={tier} onEdit={onEdit} itemLabel={label} /> : <YamlField root={root} field={sub} tier={tier} onEdit={onEdit} />}</div>
          </Card>
        );
      })}
      {adding ? (
        <AddKeyRow id={id} existing={entries.map(([e]) => e)} valid={(k) => !keyPattern || new RegExp(keyPattern).test(k)} invalidText={`must match ${keyPattern}`} placeholder="group name"
          onAdd={(k) => { onEdit([{ op: 'set', path: [...field.path, k], value: [starterValue(root, resolve(root, listNode).items)] }]); setAdding(false); }} />
      ) : (
        <div className="add"><button type="button" className="chip" aria-label={`add group ${id}`} onClick={() => setAdding(true)}>Group</button></div>
      )}
    </div>
  );
}
