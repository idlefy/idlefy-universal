import { useEffect, useRef, useState, type ReactElement } from 'react';

/**
 * The "new key" row shared by every map-shaped widget that adds an entry by typed key
 * (`MapSection`, `ContainersField`, `MapOfListsField`) plus, as the `grid` variant, `PortsTable`'s
 * add-a-port row, and the palette's name step (`initial` + `onDraft`). `valid` checks format only; a
 * duplicate of an existing key is always rejected and reported as "already exists" ahead of `invalidText`.
 */
export function AddKeyRow(p: {
  id: string; existing: readonly string[]; valid: (key: string) => boolean; invalidText: string;
  placeholder?: string; inputAriaLabel?: string; buttonAriaLabel?: string; buttonText?: string; buttonClassName?: string; grid?: boolean;
  initial?: string;                       // prefill; on mount the input is focused with the text selected so typing replaces it
  onDraft?: (draft: string) => void;      // trimmed draft on every change (the palette previews the insert from it)
  onAdd: (key: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState(p.initial ?? '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (p.initial !== undefined) { ref.current?.focus(); ref.current?.select(); } }, []);   // mount only
  const k = draft.trim();
  const bad = k !== '' && (!p.valid(k) || p.existing.includes(k));
  const inputAria = p.inputAriaLabel ?? `new key ${p.id}`;
  const buttonAria = p.buttonAriaLabel ?? `add ${p.id}`;
  const buttonClassName = p.buttonClassName ?? 'btn';
  const buttonText = p.buttonText ?? 'add';
  const errorText = bad ? (p.existing.includes(k) ? 'already exists' : p.invalidText) : '';
  const change = (v: string) => { setDraft(v); p.onDraft?.(v.trim()); };
  const add = () => { p.onAdd(k); setDraft(''); };
  if (p.grid) {
    return (
      <>
        <input ref={ref} className={`in ${bad ? 'invalid' : ''}`} type="text" aria-label={inputAria} placeholder={p.placeholder} value={draft} onChange={(e) => change(e.target.value)} />
        <button type="button" className={buttonClassName} style={{ gridColumn: '2 / span 2' }} aria-label={buttonAria} disabled={k === '' || bad} onClick={add}>{buttonText}</button>
        <span style={{ gridColumn: '4 / -1' }} className="field-err">{errorText}</span>
      </>
    );
  }
  return (
    <div className="kv-row add">
      <input ref={ref} type="text" aria-label={inputAria} placeholder={p.placeholder ?? 'new key'} value={draft} className={bad ? 'invalid' : ''} onChange={(e) => change(e.target.value)} />
      <button type="button" className={buttonClassName} aria-label={buttonAria} disabled={k === '' || bad} onClick={add}>{buttonText}</button>
      {bad && <span className="field-err">{errorText}</span>}
    </div>
  );
}
