import { useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import type { SchemaNode } from '../schema';
import { YamlField } from './YamlField';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isScalar = (v: unknown): boolean => v === null || typeof v !== 'object';

/**
 * True when this node's own `examples` show a non-string scalar, i.e. the map really holds numbers
 * or booleans (`tcpSocket`/`grpc`: `[{port: 5432}, {port: "postgres"}]`). Most keyvalue nodes in the
 * chart are Kubernetes *string* maps (labels, annotations, podLabels, nodeSelector, …) whose
 * examples are all strings — nodeSelector's own example is `{"…/worker": "true"}` — and Kubernetes
 * rejects an unquoted `true`/`2` there, so those must keep emitting strings.
 */
export const coercesScalars = (node: SchemaNode): boolean =>
  Array.isArray(node.examples) &&
  node.examples.some((ex: unknown) => isObj(ex) && Object.values(ex).some((v) => typeof v === 'number' || typeof v === 'boolean'));

/** The text a user typed back into the scalar it looks like, for maps that admit non-strings. */
function scalarFromText(t: string, coerce: boolean): unknown {
  if (!coerce) return t;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === 'true') return true;
  if (t === 'false') return false;
  return t;
}

export function KeyValueField(props: FieldProps): ReactElement {
  const { field, onEdit } = props;
  const id = field.path.join('.');
  const entries = field.value && typeof field.value === 'object' && !Array.isArray(field.value) ? Object.entries(field.value as Record<string, unknown>) : [];
  const [newKey, setNewKey] = useState('');
  const coerce = coercesScalars(field.schema);
  // Defensive: a hand-written values.yaml can nest an object/array under a node the schema calls
  // flat. Flat rows would silently drop it, so fall back to the YAML editor.
  if (entries.some(([, v]) => !isScalar(v))) return <YamlField {...props} />;
  return (
    <div className="kv">
      {entries.map(([k, v]) => (
        <div className="kv-row" key={k}>
          <code>{k}</code>
          <input type="text" aria-label={`${id}.${k}`} value={v === null || v === undefined ? '' : String(v)}
            onChange={(e) => onEdit([{ op: 'set', path: [...field.path, k], value: scalarFromText(e.target.value, coerce) }])} />
          <button type="button" aria-label={`remove ${id}.${k}`} onClick={() => onEdit([{ op: 'delete', path: [...field.path, k] }])}>×</button>
        </div>
      ))}
      <div className="kv-row add">
        <input type="text" aria-label={`new key ${id}`} placeholder="new key" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <button type="button" aria-label={`add ${id}`} disabled={!newKey.trim() || entries.some(([k]) => k === newKey.trim())}
          onClick={() => { onEdit([{ op: 'set', path: [...field.path, newKey.trim()], value: '' }]); setNewKey(''); }}>add</button>
      </div>
    </div>
  );
}
