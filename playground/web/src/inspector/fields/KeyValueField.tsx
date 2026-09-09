import type { ReactElement } from 'react';
import type { FieldProps } from './index';
import type { SchemaNode } from '../schema';
import { YamlField } from './YamlField';
import { AddKeyRow } from './AddKeyRow';
import { parseScalarText } from '../form';
import { isObj, isScalar } from '../../model/guards';

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
  const n = parseScalarText(t, { kind: 'number', integer: false });
  if (n !== undefined) return n;
  if (t === 'true') return true;
  if (t === 'false') return false;
  return t;
}

export function KeyValueField(props: FieldProps): ReactElement {
  const { field, onEdit } = props;
  const id = field.path.join('.');
  const entries = isObj(field.value) ? Object.entries(field.value) : [];
  const coerce = coercesScalars(field.schema);
  // Defensive: a hand-written values.yaml can nest an object/array under a node the schema calls
  // flat. Flat rows would silently drop it, so fall back to the YAML editor.
  if (entries.some(([, v]) => !isScalar(v))) return <YamlField {...props} />;
  return (
    <div className="kv">
      {entries.map(([k, v]) => (
        <div className="kv-row" key={k}>
          <code title={k}>{k}</code>
          <input type="text" aria-label={`${id}.${k}`} value={v === null || v === undefined ? '' : String(v)}
            onChange={(e) => onEdit([{ op: 'set', path: [...field.path, k], value: scalarFromText(e.target.value, coerce) }])} />
          <button type="button" className="clear icon" aria-label={`remove ${id}.${k}`} onClick={() => onEdit([{ op: 'delete', path: [...field.path, k] }])}>×</button>
        </div>
      ))}
      <AddKeyRow id={id} existing={entries.map(([k]) => k)} valid={() => true} invalidText="" hideError
        onAdd={(k) => onEdit([{ op: 'set', path: [...field.path, k], value: '' }])} />
    </div>
  );
}
