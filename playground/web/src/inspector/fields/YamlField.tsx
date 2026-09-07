import { useEffect, useState, type ReactElement } from 'react';
import { parse, stringify } from 'yaml';
import type { FieldProps } from './index';

export function YamlField({ field, onEdit }: FieldProps): ReactElement {
  const id = field.path.join('.');
  const fromValue = field.value === undefined ? '' : stringify(field.value, { lineWidth: 0 });
  const [text, setText] = useState(fromValue);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setText(fromValue); setErr(null); }, [fromValue]);
  const commit = () => {
    if (text.trim() === '') { setErr(null); if (field.present) onEdit([{ op: 'delete', path: field.path }]); return; }
    try {
      const v = parse(text);
      setErr(null);
      if (stringify(v, { lineWidth: 0 }) !== fromValue) onEdit([{ op: 'set', path: field.path, value: v }]);
    } catch (e) { setErr(`YAML: ${(e as Error).message.split('\n')[0]}`); }
  };
  return (
    <>
      <textarea id={id} aria-label={id} className={`yaml ${err ? 'invalid' : ''}`} rows={Math.min(16, Math.max(3, text.split('\n').length))} spellCheck={false}
        value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} />
      {err && <span className="field-err">{err}</span>}
      {/* keep this wording: the test matches the error span with /^YAML: / and this help text must not start with "YAML: " */}
      <span className="field-desc">Kubernetes passthrough — edited as YAML; applied when the box loses focus.</span>
    </>
  );
}
