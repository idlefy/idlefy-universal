import { useState, type ReactElement } from 'react';

/**
 * The "new key" row shared by every map-shaped widget that adds an entry by typed key
 * (`MapSection`, `ContainersField`, `MapOfListsField`) plus, as the `grid` variant, `PortsTable`'s
 * add-a-port row. `valid` checks format only; a duplicate of an existing key is always rejected and
 * reported as "already exists" ahead of `invalidText`.
 */
export function AddKeyRow(p: {
  id: string; existing: readonly string[]; valid: (key: string) => boolean; invalidText: string;
  placeholder?: string; inputAriaLabel?: string; buttonAriaLabel?: string; buttonText?: string; buttonClassName?: string; grid?: boolean;
  /** Suppress the "already exists"/invalidText message; the add button still disables. */
  hideError?: boolean;
  onAdd: (key: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState('');
  const k = draft.trim();
  const bad = k !== '' && (!p.valid(k) || p.existing.includes(k));
  const inputAria = p.inputAriaLabel ?? `new key ${p.id}`;
  const buttonAria = p.buttonAriaLabel ?? `add ${p.id}`;
  const buttonClassName = p.buttonClassName ?? 'btn';
  const buttonText = p.buttonText ?? 'add';
  const errorText = bad && !p.hideError ? (p.existing.includes(k) ? 'already exists' : p.invalidText) : '';
  const add = () => { p.onAdd(k); setDraft(''); };
  if (p.grid) {
    return (
      <>
        <input className={`in ${bad ? 'invalid' : ''}`} type="text" aria-label={inputAria} placeholder={p.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" className={buttonClassName} style={{ gridColumn: '2 / span 2' }} aria-label={buttonAria} disabled={k === '' || bad} onClick={add}>{buttonText}</button>
        <span style={{ gridColumn: '4 / -1' }} className="field-err">{errorText}</span>
      </>
    );
  }
  return (
    <div className="kv-row add">
      <input type="text" aria-label={inputAria} placeholder={p.placeholder ?? 'new key'} value={draft} className={bad ? 'invalid' : ''} onChange={(e) => setDraft(e.target.value)} />
      <button type="button" className={buttonClassName} aria-label={buttonAria} disabled={k === '' || bad} onClick={add}>{buttonText}</button>
      {bad && !p.hideError && <span className="field-err">{errorText}</span>}
    </div>
  );
}
