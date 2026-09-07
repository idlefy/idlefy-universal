import { useEffect, useState, type ReactElement } from 'react';
import type { FieldProps } from './index';

export function NumberField({ field, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const w = field.widget as { integer: boolean; min?: number; max?: number };
  const [text, setText] = useState(field.value === undefined ? '' : String(field.value));
  useEffect(() => { setText(field.value === undefined ? '' : String(field.value)); }, [field.value]);
  const bad = text !== '' && (w.integer ? !/^-?\d+$/.test(text) : Number.isNaN(Number(text)));
  return (
    <>
      <input id={id} type="text" inputMode="numeric" aria-label={id} value={text} min={w.min} max={w.max} className={bad ? 'invalid' : ''}
        onChange={(e) => {
          const t = e.target.value; setText(t);
          if (t === '') { onEdit([{ op: 'delete', path: field.path }]); return; }
          const n = Number(t);
          if (w.integer ? /^-?\d+$/.test(t) : !Number.isNaN(n)) onEdit([{ op: 'set', path: field.path, value: n }]);
        }} />
      {bad && <span className="field-err">not a {w.integer ? 'whole number' : 'number'}</span>}
    </>
  );
}
