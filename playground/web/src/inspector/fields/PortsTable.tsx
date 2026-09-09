import type { ReactElement } from 'react';
import type { FieldProps } from './index';
import { AddKeyRow } from './AddKeyRow';
import { parseScalarText } from '../form';

const PROTOCOLS = ['TCP', 'UDP', 'SCTP'];
const NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;   // Kubernetes port names (IANA_SVC_NAME, ≤15 chars)

/** Map of PortSpec as a table: name | containerPort | servicePort | protocol | ×, plus an add row. */
export function PortsTable({ field, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const ports = (field.value && typeof field.value === 'object' ? field.value : {}) as Record<string, Record<string, unknown>>;
  const names = Object.keys(ports);
  const num = (name: string, key: 'containerPort' | 'servicePort', t: string) => {
    if (t === '') return onEdit([{ op: 'delete', path: [...field.path, name, key] }]);
    const v = parseScalarText(t, { kind: 'number', integer: true }, { nonNegative: true });
    if (v !== undefined) onEdit([{ op: 'set', path: [...field.path, name, key], value: v }]);
  };
  return (
    <div className="ports">
      <span className="h">Name</span><span className="h">Container</span><span className="h">Service</span><span className="h">Protocol</span><span />
      {names.map((n) => (
        <span key={n} style={{ display: 'contents' }}>
          <code>{n}</code>
          <input className="in" type="text" inputMode="numeric" aria-label={`${id}.${n}.containerPort`} value={ports[n].containerPort === undefined ? '' : String(ports[n].containerPort)} onChange={(e) => num(n, 'containerPort', e.target.value)} />
          <input className="in" type="text" inputMode="numeric" aria-label={`${id}.${n}.servicePort`} value={ports[n].servicePort === undefined ? '' : String(ports[n].servicePort)} onChange={(e) => num(n, 'servicePort', e.target.value)} />
          <select className="in" aria-label={`${id}.${n}.protocol`} value={String(ports[n].protocol ?? 'TCP')} onChange={(e) => onEdit([{ op: 'set', path: [...field.path, n, 'protocol'], value: e.target.value }])}>
            {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button type="button" className="clear" aria-label={`remove ${id}.${n}`} onClick={() => onEdit([{ op: 'delete', path: [...field.path, n] }])}>×</button>
        </span>
      ))}
      <AddKeyRow grid id={id} existing={names} valid={(k) => NAME.test(k) && k.length <= 15} invalidText="lowercase, digits, dashes, ≤15" placeholder="name"
        inputAriaLabel={`new port name ${id}`} buttonAriaLabel={`add port ${id}`} buttonText="add port" buttonClassName="btn small"
        onAdd={(k) => onEdit([{ op: 'set', path: [...field.path, k], value: { containerPort: 8080 } }])} />
    </div>
  );
}
