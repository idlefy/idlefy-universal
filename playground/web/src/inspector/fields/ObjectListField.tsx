import { useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { FieldList } from './index';
import { resolve, classify, type SchemaNode } from '../schema';
import { itemShape, itemLabelOf, starterValue } from '../form';
import { YamlField } from './YamlField';
import { isObj } from '../../model/guards';

const leafAt = (v: unknown, leaf: string[]): unknown => leaf.reduce<any>((cur, k) => (isObj(cur) ? cur[k] : undefined), v);

/** A list of objects as rows (spec 2026-09-08 §5.2): pair rows when the item is small, collapsed block rows otherwise. */
export function ObjectListField(props: FieldProps & { itemLabel?: string }): ReactElement {
  const { root, field, onEdit, itemLabel } = props;
  const id = field.path.join('.');
  const item = resolve(root, field.schema).items as SchemaNode;
  const shape = itemShape(root, item);
  const items: unknown[] = Array.isArray(field.value) ? field.value : [];
  const [open, setOpen] = useState<Record<number, boolean>>({});
  // a present value that is not a list (hand-written map/scalar) keeps the raw editor instead of being overwritten
  if (field.present && !Array.isArray(field.value)) return <YamlField {...props} />;
  // an extras key that also promoted leaves (secretKeyRef: `.name`/`.key` are leaves, `.optional` is the extra) only
  // "carries extra data" when a sub-key beyond the promoted ones is actually set — its promoted leaves are always
  // present in the pair row, so their mere presence must not be mistaken for extra data every row already has.
  const hasExtraData = (k: string, v: Record<string, any>) => {
    const promoted = shape.leaves.filter((l) => l[0] === k).map((l) => l[1]);
    if (promoted.length === 0) return k in v;
    const nested = v[k];
    return isObj(nested) && Object.keys(nested).some((sk) => !promoted.includes(sk));
  };
  // pair rows start expanded when the value already carries an extra property; block rows always start collapsed
  const isOpen = (i: number, v: unknown) => open[i] ?? (isObj(v) && shape.extras.some((k) => hasExtraData(k, v)));
  const blockOpen = (i: number) => open[i] ?? false;
  // appending sets the next index rather than rewriting the whole array (flow style and untouched item types
  // survive); when the array itself does not exist yet (a required list that has never been set), setIn has
  // no sequence to index into, so the first item still has to create the array outright
  const append = () => {
    const v = starterValue(root, item);
    onEdit([{ op: 'set', path: items.length === 0 ? field.path : [...field.path, items.length], value: items.length === 0 ? [v] : v }]);
  };
  // deleting one index splices the sequence in place; the expansion map shifts down so it keeps following the same items
  const remove = (i: number) => {
    onEdit(items.length === 1 ? [{ op: 'delete', path: field.path }] : [{ op: 'delete', path: [...field.path, i] }]);
    setOpen(Object.fromEntries(Object.entries(open).filter(([k]) => Number(k) !== i).map(([k, v]) => [Number(k) > i ? Number(k) - 1 : Number(k), v])));
  };
  const leafSchema = (leaf: string[]) => { let n: SchemaNode = item; for (const k of leaf) n = resolve(root, n).properties[k]; return resolve(root, n); };
  const setLeaf = (i: number, leaf: string[], text: string) => {
    const path = [...field.path, i, ...leaf];
    // an emptied required leaf (the identifying `name`) is set to '' so the item never turns schema-invalid mid-typing
    if (text === '') { onEdit(leaf.length === 1 && shape.required.includes(leaf[0]) ? [{ op: 'set', path, value: '' }] : [{ op: 'delete', path }]); return; }
    const w = classify(root, leafSchema(leaf));
    const value = w.kind === 'number' ? (/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : undefined) : w.kind === 'string' && w.intOrString && /^-?\d+$/.test(text) ? Number(text) : text;
    if (value !== undefined) onEdit([{ op: 'set', path, value }]);
  };
  const leafInput = (i: number, v: unknown, leaf: string[], cls: string) => {
    const s = leafSchema(leaf);
    const cur = leafAt(v, leaf);
    const text = cur === undefined || cur === null ? '' : String(cur);
    const aria = `${id}.${i}.${leaf.join('.')}`;
    if (Array.isArray(s.enum)) return (
      <select key={aria} className={cls} aria-label={aria} value={text} onChange={(e) => setLeaf(i, leaf, e.target.value)}>
        <option value="">(unset)</option>{s.enum.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    return <input key={aria} type="text" className={cls} aria-label={aria} placeholder={leaf[leaf.length - 1]} value={text} onChange={(e) => setLeaf(i, leaf, e.target.value)} />;
  };
  // sub-keys of `k` already promoted into a pair leaf (secretKeyRef.name/.key) — the row already edits these directly
  const promotedSubKeys = (k: string) => shape.leaves.filter((l) => l[0] === k).map((l) => l[1]);
  // a "mixed" key is both promoted into pair leaves and flagged extra (secretKeyRef: `.name`/`.key` are leaves,
  // `.optional` is the leftover extra) — spec §5.2: the body is for "those extra properties" only, so the row's
  // own leaves (mixed or not) never repeat in the body; a mixed key instead gets its own nested FieldList below,
  // scoped to just its unpromoted sub-keys, so its promoted leaves aren't shown (or clearable) a second time.
  const mixedKeys = shape.extras.filter((k) => promotedSubKeys(k).length > 0);
  const hideLeaves = (k: string) => k === shape.identifying || shape.leaves.some((l) => l[0] === k);
  // "more"/expand is itself the basic-tier escape hatch for advanced settings, so its body always renders at
  // advanced tier — a basic-tier section must not hide e.g. secretKeyRef.optional once the row is expanded.
  // When every top-level key is hidden (the SecretRefEntry case: `name` is identifying, `secretKeyRef` is a
  // mixed key — both hidden by hideLeaves), the top-level FieldList would have nothing to show but its own
  // "No fields here." fallback; skip it so the body holds only the nested mixed-key FieldList(s) below.
  const itemKeys = Object.keys(resolve(root, item).properties ?? {});
  const body = (i: number, v: unknown, hide?: (k: string) => boolean) => {
    const anyVisible = !hide || itemKeys.some((k) => !hide(k));
    return (
      <div className="field-body">
        {anyVisible && <FieldList root={root} node={item} basePath={[...field.path, i]} value={v} tier="advanced" onEdit={onEdit} hide={hide} />}
        {hide === hideLeaves && mixedKeys.map((k) => (
          <FieldList key={k} root={root} node={leafSchema([k])} basePath={[...field.path, i, k]} value={leafAt(v, [k])} tier="advanced" onEdit={onEdit} hide={(sk) => promotedSubKeys(k).includes(sk)} />
        ))}
      </div>
    );
  };
  return (
    <div className="olist">
      {items.map((v, i) => shape.pair ? (
        <div key={i} className={`orow ${isOpen(i, v) ? 'open' : ''}`}>
          <div className="env">
            {leafInput(i, v, [shape.identifying!], 'var')}
            {shape.leaves.length === 1 ? leafInput(i, v, shape.leaves[0], 'in') : (
              <div className="pair">{leafInput(i, v, shape.leaves[0], '')}<span>/</span>{leafInput(i, v, shape.leaves[1], '')}</div>
            )}
            <span className="acts">
              {shape.extras.length > 0 && <button type="button" className="clear" aria-label={`more ${id}.${i}`} title="More settings" onClick={() => setOpen({ ...open, [i]: !isOpen(i, v) })}>…</button>}
              <button type="button" className="clear" aria-label={`remove ${id}.${i}`} onClick={() => remove(i)}>×</button>
            </span>
          </div>
          {isOpen(i, v) && body(i, v, hideLeaves)}
        </div>
      ) : (
        <div key={i} className={`field block orow ${blockOpen(i) ? 'open' : ''}`}>
          <div className="field-head">
            <button type="button" className="expand" aria-label={`expand ${id}.${i}`} aria-expanded={blockOpen(i)} onClick={() => setOpen({ ...open, [i]: !blockOpen(i) })}>
              <code>{String((shape.identifying && leafAt(v, [shape.identifying])) ?? `#${i + 1}`)}</code>
              <span className="muted">{isObj(v) ? `${Object.keys(v).length} fields` : ''}</span>
            </button>
            <button type="button" className="clear" aria-label={`remove ${id}.${i}`} onClick={() => remove(i)}>×</button>
          </div>
          {blockOpen(i) && body(i, v)}
        </div>
      ))}
      <div className="add">
        <button type="button" className="chip" aria-label={`add ${id}`} onClick={append}>{itemLabel ?? itemLabelOf(field.key)}</button>
      </div>
    </div>
  );
}
