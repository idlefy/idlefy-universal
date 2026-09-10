import type { ReactElement } from 'react';
import type { FieldProps } from './index';
import { FieldList } from './index';

export function ObjectSection({ root, field, tier, onEdit, lockedPaths, workload }: FieldProps): ReactElement {
  return (
    <div className="object">
      <FieldList root={root} node={field.schema} basePath={field.path} value={field.value} tier={tier} onEdit={onEdit} lockedPaths={lockedPaths} workload={workload} />
    </div>
  );
}
