import { useState, type ReactElement } from 'react';
import type { ValuesPath, EditOp } from '../../model/ValuesDocument';
import type { Tier } from '../../app/state';
import type { SchemaNode } from '../schema';
import { buildFields, chipValue, humanize, type Field } from '../form';
import { FieldRow } from './FieldRow';

export type FieldProps = { root: SchemaNode; field: Field; tier: Tier; onEdit: (ops: EditOp[]) => void };
export { FieldRow };

/** More chips than this collapse behind a "+N more" chip, so a section with many optional keys stays a row, not a wall. */
const CHIP_CAP = 8;

function AddChips({ root, fields, onEdit }: { root: SchemaNode; fields: Field[]; onEdit: (ops: EditOp[]) => void }): ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  if (fields.length === 0) return null;
  // collapsing 9 chips behind "+1 more" would be silly: only collapse when it hides at least three
  const collapse = !expanded && fields.length >= CHIP_CAP + 3;
  const shown = collapse ? fields.slice(0, CHIP_CAP) : fields;
  const rest = fields.length - shown.length;
  return (
    <div className="add">
      <span>Add</span>
      {shown.map((f) => {
        const id = f.path.join('.');
        return (
          <button key={f.key} type="button" className="chip" aria-label={`add field ${id}`} title={f.description}
            onClick={() => onEdit([{ op: 'set', path: f.path, value: chipValue(root, f) }, ...f.evict])}>
            {humanize(f.label)}
          </button>
        );
      })}
      {rest > 0 && (
        <button type="button" className="chip more" aria-label={`show ${rest} more fields`} onClick={() => setExpanded(true)}>+{rest} more</button>
      )}
    </div>
  );
}

export function FieldList(p: {
  root: SchemaNode; node: SchemaNode; basePath: ValuesPath; value: unknown; tier: Tier;
  onEdit: (ops: EditOp[]) => void; hide?: (key: string) => boolean; order?: readonly string[];
}): ReactElement {
  const fields = buildFields(p.root, p.node, p.basePath, p.value, p.tier, { hide: p.hide });
  // Some sections want keys in a specific display order; buildFields walks the schema alphabetically. Stable sort: unlisted keys keep schema order after the listed ones.
  const rank = new Map((p.order ?? []).map((k, i) => [k, i]));
  const byOrder = (a: Field, b: Field) => (rank.get(a.key) ?? 1e9) - (rank.get(b.key) ?? 1e9);
  const rows = fields.filter((f) => f.present || f.required).sort(byOrder);
  const chips = fields.filter((f) => !f.present && !f.required).sort(byOrder);
  if (rows.length === 0 && chips.length === 0) return <p className="muted">No fields here.</p>;
  return (
    <>
      {rows.length > 0 && <div className="fields">{rows.map((f) => <FieldRow key={f.key} root={p.root} field={f} tier={p.tier} onEdit={p.onEdit} />)}</div>}
      <AddChips root={p.root} fields={chips} onEdit={p.onEdit} />
    </>
  );
}
