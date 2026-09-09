import { useMemo, useState, type ReactElement } from 'react';
import type { SchemaNode } from '../inspector/schema';
import { AddKeyRow } from '../inspector/fields/AddKeyRow';
import { KindIcon } from '../canvas/icons';
import { familyOf } from '../graph/labels';
import { isObj } from '../model/guards';
import { DNS_LABEL, defaultName, namePattern, uniqueName, type Entity } from '../graph/entities';
import { previewYaml, starterBody } from './add';

/** Step 2 of the launcher: name the new entity and preview the insert (spec §3). */
export function NameStep(p: { root: SchemaNode; entity: Entity; values: Record<string, unknown>; onBack: () => void; onAdd: (name: string) => void }): ReactElement {
  const { key, label, kind } = p.entity;
  const existing = useMemo(() => Object.keys(isObj(p.values[key]) ? (p.values[key] as object) : {}), [p.values, key]);
  const pattern = useMemo(() => namePattern(p.root, key), [p.root, key]);
  const initial = useMemo(() => uniqueName(defaultName(p.root, key), existing), [p.root, key, existing]);
  const [draft, setDraft] = useState(initial);
  const name = draft || initial;
  const valid = draft !== '' && pattern.test(draft) && !existing.includes(draft);
  const preview = useMemo(() => previewYaml(key, name, starterBody(p.root, key, name)), [p.root, key, name]);
  const fam = familyOf(kind);
  return (
    <div className="name-step" onKeyDown={(e) => { if (e.key === 'Enter' && valid && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); p.onAdd(draft); } }}>   {/* a focused button already fires onAdd via click activation */}
      <div className="nhead">
        <button type="button" className="icon-btn" aria-label="Back to the list" title="Back to the list" onClick={p.onBack}>‹</button>
        <span className={`tile sm fam-${fam}`}><KindIcon kind={kind} /></span>
        <b>New {label}</b>
        <code>{key}.‹name›</code>
      </div>
      <AddKeyRow id={key} inputAriaLabel="Name" placeholder={initial} initial={initial} onDraft={setDraft}
        existing={existing} valid={(k) => pattern.test(k)} invalidText={`must match ${pattern.source}`}
        buttonText={`Add ${label}`} buttonAriaLabel={`Add ${label}`} buttonClassName="btn primary" onAdd={p.onAdd} />
      <p className="hint">{pattern.source === DNS_LABEL.source ? 'Lowercase letters, digits and dashes (DNS label).' : `Must match ${pattern.source}`}</p>
      <div className="preview">
        <div className="ph">Inserted from the schema example</div>
        <pre>{preview}</pre>
        <p className="hint">Names in references are placeholders; edit them in the inspector.</p>
      </div>
      <div className="keys"><kbd>Enter</kbd> add <kbd>Esc</kbd> back</div>
    </div>
  );
}
