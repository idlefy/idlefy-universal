import type { ReactElement } from 'react';
import type { FieldProps } from './index';

export function TextField({ field, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const w = field.widget as { enum?: string[]; pattern?: string; intOrString?: true };
  const v = field.value === undefined ? '' : String(field.value);
  const emit = (t: string) => {
    if (t === '') { onEdit([{ op: 'delete', path: field.path }]); return; }
    // IntOrString fields (pdb.minAvailable, targetPort, maxSurge) reject a numeric-looking *string*
    // in the Kubernetes API, so digits are committed as a number and everything else as a string.
    const value = w.intOrString && /^-?\d+$/.test(t) ? Number(t) : t;
    onEdit([{ op: 'set', path: field.path, value }]);
  };
  if (w.enum) {
    return (
      <select id={id} aria-label={id} value={v} onChange={(e) => emit(e.target.value)}>
        <option value="">(unset)</option>
        {w.enum.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  const bad = !!w.pattern && v !== '' && !new RegExp(w.pattern).test(v);
  return (
    <>
      <input id={id} type="text" aria-label={id} value={v} className={bad ? 'invalid' : ''} onChange={(e) => emit(e.target.value)} />
      {bad && <span className="field-err">must match {w.pattern}</span>}
    </>
  );
}
