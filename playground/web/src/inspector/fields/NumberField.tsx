import { useEffect, useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { parseScalarText } from '../form';

export function NumberField({ field, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const w = field.widget as { integer: boolean; min?: number; max?: number };
  const [text, setText] = useState(field.value === undefined ? '' : String(field.value));
  useEffect(() => { setText(field.value === undefined ? '' : String(field.value)); }, [field.value]);
  const parsed = text === '' ? undefined : parseScalarText(text, field.widget);
  // `min`/`max` on an <input type="text"> is decoration — the browser never enforces it, so an
  // out-of-range value used to be committed and the chart rejected the document.
  const outOfRange = typeof parsed === 'number' && ((w.min !== undefined && parsed < w.min) || (w.max !== undefined && parsed > w.max));
  const emptyLocked = text === '' && field.locked;
  const bad = (text !== '' && parsed === undefined) || outOfRange || emptyLocked;
  const rangeText = w.min !== undefined && w.max !== undefined ? `must be between ${w.min} and ${w.max}`
    : w.min !== undefined ? `must be at least ${w.min}`
    : w.max !== undefined ? `must be at most ${w.max}` : '';
  return (
    <>
      <input id={id} type="text" inputMode="numeric" aria-label={id} value={text} min={w.min} max={w.max} className={bad ? 'invalid' : ''}
        onChange={(e) => {
          const t = e.target.value; setText(t);
          if (t === '') { if (!field.locked) onEdit([{ op: 'delete', path: field.path }]); return; }
          const v = parseScalarText(t, field.widget);
          if (v === undefined || typeof v !== 'number') return;
          if ((w.min !== undefined && v < w.min) || (w.max !== undefined && v > w.max)) return;
          onEdit([{ op: 'set', path: field.path, value: v }]);
        }} />
      {emptyLocked && <span className="field-err">required</span>}
      {!emptyLocked && outOfRange && <span className="field-err">{rangeText}</span>}
      {!emptyLocked && !outOfRange && bad && <span className="field-err">not a {w.integer ? 'whole number' : 'number'}</span>}
    </>
  );
}
