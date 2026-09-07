import type { ReactElement } from 'react';
import type { ValuesPath, EditOp } from '../../model/ValuesDocument';
import type { Tier } from '../../app/state';
import type { SchemaNode } from '../schema';
import { buildFields, chipValue, type Field } from '../form';
import { FieldRow } from './FieldRow';

export type FieldProps = { root: SchemaNode; field: Field; tier: Tier; onEdit: (ops: EditOp[]) => void };
export { FieldRow };

export function AddChips({ root, fields, onEdit }: { root: SchemaNode; fields: Field[]; onEdit: (ops: EditOp[]) => void }): ReactElement | null {
  if (fields.length === 0) return null;
  return (
    <div className="add">
      <span>Add</span>
      {fields.map((f) => {
        const id = f.path.join('.');
        return (
          <button key={f.key} type="button" className="chip" aria-label={`add field ${id}`} title={f.description}
            onClick={() => onEdit([{ op: 'set', path: f.path, value: chipValue(root, f) }])}>
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

export function FieldList(p: {
  root: SchemaNode; node: SchemaNode; basePath: ValuesPath; value: unknown; tier: Tier;
  onEdit: (ops: EditOp[]) => void; hide?: (key: string) => boolean; chips?: boolean; order?: readonly string[];
}): ReactElement {
  const fields = buildFields(p.root, p.node, p.basePath, p.value, p.tier, { hide: p.hide });
  // Spec §5.2 lists keys "in this order"; buildFields walks the schema alphabetically. Stable sort: unlisted keys keep schema order after the listed ones.
  const rank = new Map((p.order ?? []).map((k, i) => [k, i]));
  const byOrder = (a: Field, b: Field) => (rank.get(a.key) ?? 1e9) - (rank.get(b.key) ?? 1e9);
  const rows = fields.filter((f) => f.present || f.required).sort(byOrder);
  const chips = (p.chips === false ? [] : fields.filter((f) => !f.present && !f.required)).sort(byOrder);
  if (rows.length === 0 && chips.length === 0) return <p className="muted">No fields here.</p>;
  return (
    <>
      {rows.length > 0 && <div className="fields">{rows.map((f) => <FieldRow key={f.key} root={p.root} field={f} tier={p.tier} onEdit={p.onEdit} />)}</div>}
      <AddChips root={p.root} fields={chips} onEdit={p.onEdit} />
    </>
  );
}
