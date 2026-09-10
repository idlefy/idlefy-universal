import { useEffect, useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { parseScalarText } from '../form';

export function TextField({ field, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const w = field.widget as { enum?: string[]; pattern?: string; intOrString?: true };
  const committed = field.value === undefined ? '' : String(field.value);
  // A locked key (schema-required, chart-required, or the last half of a oneOf pair) must survive an
  // emptied box: keep the text locally, mark it invalid, and emit nothing until it is legal again.
  // Mirrors NumberField's resync rule — any pending text is stale once the committed value moves.
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [committed]);
  const v = draft ?? committed;
  const emit = (t: string) => {
    if (t === '') {
      if (field.locked) { setDraft(''); return; }
      setDraft(null);
      onEdit([{ op: 'delete', path: field.path }]);
      return;
    }
    setDraft(null);
    // IntOrString fields (pdb.minAvailable, targetPort, maxSurge) reject a numeric-looking *string*
    // in the Kubernetes API, so digits are committed as a number and everything else as a string —
    // parseScalarText's `string`+`intOrString` branch never returns undefined, so this always emits.
    onEdit([{ op: 'set', path: field.path, value: parseScalarText(t, field.widget) }]);
  };
  if (w.enum) {
    return (
      <select id={id} aria-label={id} value={v} onChange={(e) => emit(e.target.value)}>
        {/* a locked enum has no "unset" state: picking it used to delete a required key (configs.type) */}
        {!field.locked && <option value="">(unset)</option>}
        {w.enum.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  const empty = v === '' && draft !== null;
  const bad = empty || (!!w.pattern && v !== '' && !new RegExp(w.pattern).test(v));
  return (
    <>
      <input id={id} type="text" aria-label={id} value={v} className={bad ? 'invalid' : ''} onChange={(e) => emit(e.target.value)} />
      {empty && <span className="field-err">required</span>}
      {!empty && bad && <span className="field-err">must match {w.pattern}</span>}
    </>
  );
}
