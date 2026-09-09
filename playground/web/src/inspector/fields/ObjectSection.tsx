import type { ReactElement } from 'react';
import type { FieldProps } from './index';
import { FieldList } from './index';

export function ObjectSection({ root, field, tier, onEdit }: FieldProps): ReactElement {
  return (
    <div className="object">
      <FieldList root={root} node={field.schema} basePath={field.path} value={field.value} tier={tier} onEdit={onEdit} />
    </div>
  );
}
