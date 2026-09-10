import { useEffect, useState, type ReactElement } from 'react';
import type { FieldProps } from './index';
import { AddKeyRow } from './AddKeyRow';
import { nextFreeNumber, parseScalarText } from '../form';
import { isObj } from '../../model/guards';

const PROTOCOLS = ['TCP', 'UDP', 'SCTP'];
const NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;   // Kubernetes port names (IANA_SVC_NAME, ≤15 chars)
// values.schema.json → PortSpec.containerPort / servicePort: minimum 1, maximum 65535. This widget is
// only ever routed to for a PortSpec map (FieldRow.tsx), so the bounds are named rather than derived.
const PORT_MIN = 1;
const PORT_MAX = 65535;
const DEFAULT_PORT = 8080;

/** Map of PortSpec as a table: name | containerPort | servicePort | protocol | ×, plus an add row. */
export function PortsTable({ field, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const ports = isObj<Record<string, Record<string, unknown>>>(field.value) ? field.value : {};
  const names = Object.keys(ports);
  // text the user is still typing that must not be committed: out of range, unparseable, or an
  // emptied containerPort (PortSpec.required) — deleting that key made the document unrenderable.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const valueKey = JSON.stringify(field.value ?? null);
  useEffect(() => { setDrafts({}); }, [valueKey]);
  const used = new Set<number>();
  for (const p of Object.values(ports)) {
    if (typeof p.containerPort === 'number') used.add(p.containerPort);
    if (typeof p.servicePort === 'number') used.add(p.servicePort);
  }
  const clearDraft = (key: string) => setDrafts((d) => { if (!(key in d)) return d; const next = { ...d }; delete next[key]; return next; });
  const num = (name: string, key: 'containerPort' | 'servicePort', t: string) => {
    const draftKey = `${name}.${key}`;
    if (t === '') {
      if (key === 'containerPort') { setDrafts((d) => ({ ...d, [draftKey]: '' })); return; }
      clearDraft(draftKey);
      onEdit([{ op: 'delete', path: [...field.path, name, key] }]);
      return;
    }
    const v = parseScalarText(t, { kind: 'number', integer: true }, { nonNegative: true });
    if (typeof v !== 'number' || v < PORT_MIN || v > PORT_MAX) { setDrafts((d) => ({ ...d, [draftKey]: t })); return; }
    clearDraft(draftKey);
    onEdit([{ op: 'set', path: [...field.path, name, key], value: v }]);
  };
  const cell = (name: string, key: 'containerPort' | 'servicePort') => {
    const draftKey = `${name}.${key}`;
    const committed = ports[name][key] === undefined ? '' : String(ports[name][key]);
    const draft = drafts[draftKey];
    return (
      <input className={['in', draft !== undefined && 'invalid'].filter(Boolean).join(' ')} type="text" inputMode="numeric"
        aria-label={`${id}.${name}.${key}`} value={draft ?? committed} onChange={(e) => num(name, key, e.target.value)} />
    );
  };
  return (
    <div className="ports">
      <span className="h">Name</span><span className="h">Container</span><span className="h">Service</span><span className="h">Protocol</span><span />
      {names.map((n) => (
        <span key={n} style={{ display: 'contents' }}>
          <code>{n}</code>
          {cell(n, 'containerPort')}
          {cell(n, 'servicePort')}
          <select className="in" aria-label={`${id}.${n}.protocol`} value={String(ports[n].protocol ?? 'TCP')} onChange={(e) => onEdit([{ op: 'set', path: [...field.path, n, 'protocol'], value: e.target.value }])}>
            {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="button" className="clear" aria-label={`remove ${id}.${n}`} onClick={() => onEdit([{ op: 'delete', path: [...field.path, n] }])}>×</button>
        </span>
      ))}
      <AddKeyRow grid id={id} existing={names} valid={(k) => NAME.test(k) && k.length <= 15} invalidText="lowercase, digits, dashes, ≤15" placeholder="name"
        inputAriaLabel={`new port name ${id}`} buttonAriaLabel={`add port ${id}`} buttonText="add port" buttonClassName="btn small"
        onAdd={(k) => onEdit([{ op: 'set', path: [...field.path, k], value: { containerPort: nextFreeNumber(DEFAULT_PORT, used) } }])} />
    </div>
  );
}
