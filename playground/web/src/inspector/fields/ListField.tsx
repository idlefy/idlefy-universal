import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { YamlField } from './YamlField';
import { isScalar } from './KeyValueField';

/** One row per item (spec 2026-09-08 §5.1). Add appends an item and focuses it; removing the last item deletes the key. */
export function ListField(props: FieldProps): ReactElement {
  const { field, onEdit } = props;
  const id = field.path.join('.');
  const w = field.widget as { enum?: string[] };
  const items = Array.isArray(field.value) ? field.value.map(String) : [];
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // the new row only exists after the edit round-trips through the document, so focus it when it appears;
  // the request is dropped either way so a no-op edit (disabled, unchanged) cannot latch and steal focus later
  useEffect(() => {
    if (focusIdx === null) return;
    box.current?.querySelector<HTMLElement>(`[data-idx="${focusIdx}"]`)?.focus();
    setFocusIdx(null);
  }, [focusIdx, items.length]);
  const append = (v: string) => onEdit([{ op: 'set', path: field.path, value: [...items, v] }]);
  // deleting one index splices the sequence in place (flow style survives); deleting the last item removes the key
  const remove = (i: number) => onEdit(items.length === 1 ? [{ op: 'delete', path: field.path }] : [{ op: 'delete', path: [...field.path, i] }]);
  const setOne = (i: number, v: string) => onEdit([{ op: 'set', path: [...field.path, i], value: v }]);
  // a present value that isn't a list, or a list holding a non-scalar item (hand-written map/object),
  // keeps the raw editor instead of being overwritten or coerced through String()
  if (field.present && (!Array.isArray(field.value) || !field.value.every(isScalar))) return <YamlField {...props} />;
  return (
    <div className="slist" ref={box}>
      {items.map((v, i) => (
        <div className="srow" key={i}>
          {w.enum ? (
            <select className="in" data-idx={i} aria-label={`${id}.${i}`} value={v} onChange={(e) => setOne(i, e.target.value)}>
              {w.enum.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input type="text" className="in" data-idx={i} aria-label={`${id}.${i}`} value={v} onChange={(e) => setOne(i, e.target.value)} />
          )}
          <button type="button" className="clear" aria-label={`remove ${id}.${i}`} onClick={() => remove(i)}>×</button>
        </div>
      ))}
      <div className="add">
        <button type="button" className="chip" aria-label={`add ${id}`} onClick={() => { append(w.enum ? w.enum[0] : ''); setFocusIdx(items.length); }}>Item</button>
      </div>
    </div>
  );
}
