import { useEffect, useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { FieldList } from './index';
import { resolve, classify, type SchemaNode } from '../schema';
import { itemShape, itemLabelOf, parseScalarText, starterValue } from '../form';
import { YamlField } from './YamlField';
import { isObj } from '../../model/guards';

const leafAt = (v: unknown, leaf: string[]): unknown => leaf.reduce<any>((cur, k) => (isObj(cur) ? cur[k] : undefined), v);

/** A list of objects as rows: pair rows when the item is small, collapsed block rows otherwise. */
export function ObjectListField(props: FieldProps & { itemLabel?: string }): ReactElement {
  const { root, field, onEdit, itemLabel } = props;
  const id = field.path.join('.');
  const item = resolve(root, field.schema).items as SchemaNode;
  const shape = itemShape(root, item);
  const items: unknown[] = Array.isArray(field.value) ? field.value : [];
  const [open, setOpen] = useState<Record<number, boolean>>({});
  // per-leaf (row, path) text the user is still typing that does not yet parse to a value; kept only
  // while invalid, so the input shows what was typed and carries the `invalid` class until it is fixed
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // the list can also change out from under a pending draft (e.g. an edit made directly in the YAML
  // pane) — mirror NumberField's resync-on-`field.value` rule: any not-yet-committed text is stale once
  // the committed value moves, so drop it. Keyed on the value's content, not its identity: `field.value` is a fresh
  // `toJS()` object on every parent render, so an identity dep would erase a draft mid-keystroke. Kept above the
  // early return below: hooks must run unconditionally. Re-stringifying on every render is intentional — it is
  // the cheapest value-based key available here; do not go back to an identity check.
  const valueKey = JSON.stringify(field.value ?? null);
  useEffect(() => { setDrafts({}); }, [valueKey]);
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
  // appending sets the next index rather than rewriting the whole array, so flow style and untouched item types survive
  const append = () => {
    const v = starterValue(root, item);
    onEdit([{ op: 'set', path: [...field.path, items.length], value: v }]);
  };
  // deleting one index splices the sequence in place; the expansion map (and any pending drafts) shift
  // down so they keep following the same items
  const remove = (i: number) => {
    onEdit(items.length === 1 ? [{ op: 'delete', path: field.path }] : [{ op: 'delete', path: [...field.path, i] }]);
    setOpen(Object.fromEntries(Object.entries(open).filter(([k]) => Number(k) !== i).map(([k, v]) => [Number(k) > i ? Number(k) - 1 : Number(k), v])));
    setDrafts({});
  };
  // resolving every leaf's (and every extra top-level key's) schema is a walk down `item`'s properties;
  // that set is fixed by the item shape (not by how many rows exist), so it is computed once per render
  // rather than once per row per render — `leafSchema([k])` for a mixed extra key (`secretKeyRef`) needs
  // the same map as the promoted leaves (`secretKeyRef.name`) it shares a prefix with. Plain const, not
  // `useMemo`: `shape` is a fresh object every render (itemShape() is not itself memoized), so a memo
  // keyed on it would never hit, and — since this sits after the early `return <YamlField/>` above —
  // a hook here would change hook count across renders whenever `field.value` crosses array/non-array.
  const leafSchemas = new Map<string, SchemaNode>();
  {
    const keys: string[][] = [...shape.leaves, ...shape.extras.map((k) => [k])];
    if (shape.identifying) keys.push([shape.identifying]);
    for (const leaf of keys) {
      let n: SchemaNode = item;
      for (const k of leaf) n = resolve(root, n).properties[k];
      leafSchemas.set(leaf.join('.'), resolve(root, n));
    }
  }
  const leafSchema = (leaf: string[]): SchemaNode => leafSchemas.get(leaf.join('.'))!;
  const clearDraft = (key: string) => setDrafts((d) => { if (!(key in d)) return d; const next = { ...d }; delete next[key]; return next; });
  const setLeaf = (i: number, leaf: string[], text: string) => {
    const draftKey = `${i}.${leaf.join('.')}`;
    const path = [...field.path, i, ...leaf];
    // an emptied required leaf (the identifying `name`) is set to '' so the item never turns schema-invalid mid-typing
    if (text === '') {
      clearDraft(draftKey);
      onEdit(leaf.length === 1 && shape.required.includes(leaf[0]) ? [{ op: 'set', path, value: '' }] : [{ op: 'delete', path }]);
      return;
    }
    const value = parseScalarText(text, classify(root, leafSchema(leaf)));
    if (value === undefined) { setDrafts((d) => ({ ...d, [draftKey]: text })); return; }
    clearDraft(draftKey);
    onEdit([{ op: 'set', path, value }]);
  };
  const leafInput = (i: number, v: unknown, leaf: string[], cls: string) => {
    const s = leafSchema(leaf);
    const draftKey = `${i}.${leaf.join('.')}`;
    const cur = leafAt(v, leaf);
    const committed = cur === undefined || cur === null ? '' : String(cur);
    const draft = drafts[draftKey];
    const text = draft ?? committed;
    const aria = `${id}.${i}.${leaf.join('.')}`;
    if (Array.isArray(s.enum)) return (
      <select key={aria} className={cls} aria-label={aria} value={text} onChange={(e) => setLeaf(i, leaf, e.target.value)}>
        <option value="">(unset)</option>{s.enum.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
    const className = [cls, draft !== undefined && 'invalid'].filter(Boolean).join(' ');
    return <input key={aria} type="text" className={className} aria-label={aria} placeholder={leaf[leaf.length - 1]} value={text} onChange={(e) => setLeaf(i, leaf, e.target.value)} />;
  };
  // sub-keys of `k` already promoted into a pair leaf (secretKeyRef.name/.key) — the row already edits these directly
  const promotedSubKeys = (k: string) => shape.leaves.filter((l) => l[0] === k).map((l) => l[1]);
  // a "mixed" key is both promoted into pair leaves and flagged extra (secretKeyRef: `.name`/`.key` are leaves,
  // `.optional` is the leftover extra) — the body is for those extra properties only, so the row's
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
  // `pair` says which row shape called this: a pair row hides its own leaves from the nested FieldList
  // and also renders the mixed-key FieldLists below it; a block row shows everything, unfiltered.
  const body = (i: number, v: unknown, pair: boolean) => {
    const hide = pair ? hideLeaves : undefined;
    const anyVisible = !pair || itemKeys.some((k) => !hideLeaves(k));
    return (
      <div className="field-body">
        {anyVisible && <FieldList root={root} node={item} basePath={[...field.path, i]} value={v} tier="advanced" onEdit={onEdit} hide={hide} />}
        {pair && mixedKeys.map((k) => (
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
          {isOpen(i, v) && body(i, v, true)}
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
          {blockOpen(i) && body(i, v, false)}
        </div>
      ))}
      <div className="add">
        <button type="button" className="chip" aria-label={`add ${id}`} onClick={append}>{itemLabel ?? itemLabelOf(field.key)}</button>
      </div>
    </div>
  );
}
