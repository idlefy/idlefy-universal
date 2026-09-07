import { useEffect, useState, type ReactElement } from 'react';
import type { FieldProps } from './index';

export function ListField({ field, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const w = field.widget as { enum?: string[] };
  const fromValue = Array.isArray(field.value) ? field.value.map(String).join('\n') : '';
  const [text, setText] = useState(fromValue);
  useEffect(() => { setText(fromValue); }, [fromValue]);
  return (
    <>
      <textarea id={id} aria-label={id} rows={Math.max(2, text.split('\n').length)} value={text} placeholder="one item per line"
        onChange={(e) => {
          const t = e.target.value; setText(t);
          const items = t.split('\n').map((s) => s.trim()).filter(Boolean);
          onEdit(items.length ? [{ op: 'set', path: field.path, value: items }] : [{ op: 'delete', path: field.path }]);
        }} />
      {w.enum && <span className="field-desc">one of: {w.enum.join(', ')}</span>}
    </>
  );
}
