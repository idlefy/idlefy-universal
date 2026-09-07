import type { ReactElement } from 'react';
import type { ValuesPath, EditOp } from '../../model/ValuesDocument';
import type { Tier } from '../../app/state';
import type { SchemaNode } from '../schema';
import { buildFields, type Field } from '../form';
import { FieldRow } from './FieldRow';

export type FieldProps = { root: SchemaNode; field: Field; tier: Tier; onEdit: (ops: EditOp[]) => void };
export { FieldRow };

export function FieldList(p: {
  root: SchemaNode; node: SchemaNode; basePath: ValuesPath; value: unknown; tier: Tier;
  onEdit: (ops: EditOp[]) => void; hide?: (key: string) => boolean;
}): ReactElement {
  const fields = buildFields(p.root, p.node, p.basePath, p.value, p.tier, { hide: p.hide });
  if (fields.length === 0) return <p className="muted">No {p.tier} fields here.</p>;
  return (
    <div className="fields">
      {fields.map((f) => <FieldRow key={f.key} root={p.root} field={f} tier={p.tier} onEdit={p.onEdit} />)}
    </div>
  );
}
