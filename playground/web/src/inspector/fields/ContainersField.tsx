import type { ReactElement } from 'react';
import type { FieldProps } from './index';
import { FieldList } from './index';
import { AddKeyRow } from './AddKeyRow';
import { Card } from './Card';
import { resolve, type SchemaNode } from '../schema';
import { starterValue } from '../form';
import { ImageField } from './ImageField';

// `containers` has no propertyNames pattern in the schema, so fall back to Kubernetes container-name rules.
const NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/** One card per container: image:tag row, the remaining present fields, chips for the rest; add row below. */
export function ContainersField({ root, field, tier, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const item = resolve(root, field.schema).additionalProperties as SchemaNode;
  const pattern = (field.widget as { keyPattern?: string }).keyPattern ?? NAME.source;
  const containers = (field.value && typeof field.value === 'object' ? field.value : {}) as Record<string, Record<string, unknown>>;
  const names = Object.keys(containers);
  return (
    <div className="containers">
      {names.map((n) => {
        const base = [...field.path, n];
        const c = containers[n] ?? {};
        return (
          <Card key={n} code={n} removeLabel={`remove ${id}.${n}`} removeTitle="Remove this container" removeText="remove" onRemove={() => onEdit([{ op: 'delete', path: base }])}>
            <ImageField base={base} image={c.image as string | undefined} imageTag={c.imageTag as string | undefined} onEdit={onEdit} />
            <FieldList root={root} node={item} basePath={base} value={c} tier={tier} onEdit={onEdit} hide={(x) => x === 'image' || x === 'imageTag'} />
          </Card>
        );
      })}
      <AddKeyRow id={id} existing={names} valid={(k) => new RegExp(pattern).test(k)} invalidText="lowercase letters, digits and dashes" placeholder="new container name"
        buttonText="+ container" buttonClassName="btn small" onAdd={(k) => onEdit([{ op: 'set', path: [...field.path, k], value: starterValue(root, item) }])} />
    </div>
  );
}
