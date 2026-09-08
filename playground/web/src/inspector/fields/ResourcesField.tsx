import type { ReactElement } from 'react';
import type { FieldProps } from './index';

const ROWS = ['requests', 'limits'] as const;
const COLS = ['cpu', 'memory'] as const;

/** 2 × 2 grid for ResourceRequirements. Other keys (ephemeral-storage, hugepages) stay in the YAML untouched. */
export function ResourcesField({ field, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const v = (field.value && typeof field.value === 'object' ? field.value : {}) as Record<string, Record<string, unknown>>;
  return (
    <div className="grid22">
      <span /><span className="h">CPU</span><span className="h">Memory</span>
      {ROWS.map((r) => (
        <span key={r} style={{ display: 'contents' }}>
          <span className="rl">{r === 'requests' ? 'Requests' : 'Limits'}</span>
          {COLS.map((c) => (
            <input key={c} className="in" type="text" aria-label={`${id}.${r}.${c}`} value={v[r]?.[c] === undefined ? '' : String(v[r]![c])} placeholder={c === 'cpu' ? '100m' : '128Mi'}
              onChange={(e) => onEdit([e.target.value === '' ? { op: 'delete', path: [...field.path, r, c] } : { op: 'set', path: [...field.path, r, c], value: e.target.value }])} />
          ))}
        </span>
      ))}
    </div>
  );
}
