import type { ReactElement } from 'react';
import type { FieldProps } from './index';

export function BooleanField({ field, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  return (
    <input id={id} type="checkbox" aria-label={id} checked={field.value === true}
      onChange={(e) => onEdit([{ op: 'set', path: field.path, value: e.target.checked }])} />
  );
}
