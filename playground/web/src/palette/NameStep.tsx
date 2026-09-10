import { useMemo, useState, type ReactElement } from 'react';
import type { SchemaNode } from '../inspector/schema';
import { AddKeyRow } from '../inspector/fields/AddKeyRow';
import { KindIcon } from '../canvas/icons';
import { familyOf } from '../graph/labels';
import { isObj } from '../model/guards';
import { DNS_LABEL, defaultName, namePattern, uniqueName, type Entity } from '../graph/entities';
import { WORKLOAD_KEYS } from '../graph/secondary';
import { previewYaml, starterBody } from './add';

/** Step 2 of the launcher: name the new entity and preview the insert (spec §3). */
export function NameStep(p: { root: SchemaNode; entity: Entity; values: Record<string, unknown>; onBack: () => void; onAdd: (name: string) => void }): ReactElement {
  const { key, label, kind } = p.entity;
  // The chart's duplicate-key guard spans all five workload maps ("Workload key 'web' appears in
  // multiple top-level keys: deployments, jobs"), so a Job may not take a Deployment's name. A
  // standalone resource is scoped to its own map, as the schema is.
  const existing = useMemo(() => {
    const keysOf = (k: string) => Object.keys(isObj(p.values[k]) ? (p.values[k] as object) : {});
    return WORKLOAD_KEYS.has(key) ? [...new Set([...WORKLOAD_KEYS].flatMap(keysOf))] : keysOf(key);
  }, [p.values, key]);
  const pattern = useMemo(() => namePattern(p.root, key), [p.root, key]);
  const initial = useMemo(() => uniqueName(defaultName(p.root, key), existing), [p.root, key, existing]);
  // `null` = the row still holds the prefilled `initial`; anything else is the (trimmed) typed draft,
  // so a whitespace-only field reads as '' and previews nothing instead of promising the placeholder.
  const [typed, setTyped] = useState<string | null>(null);
  const name = typed ?? initial;
  const valid = name !== '' && pattern.re.test(name) && !existing.includes(name);
  // Gated on `valid`, not just non-empty: an in-progress or invalid name (a duplicate, or one that
  // fails the schema's pattern) has no insert to preview — showing the last-valid preview under it
  // would misrepresent what Enter is actually about to do.
  const preview = useMemo(() => (valid ? previewYaml(key, name, starterBody(p.root, key, name)) : null), [p.root, key, name, valid]);
  const fam = familyOf(kind);
  return (
    <div className="name-step" onKeyDown={(e) => { if (e.key === 'Enter' && valid && !(e.target as HTMLElement).closest('button')) { e.preventDefault(); p.onAdd(name); } }}>   {/* a focused button already fires onAdd via click activation */}
      <div className="nhead">
        <button type="button" className="icon-btn" aria-label="Back to the list" title="Back to the list" onClick={p.onBack}>‹</button>
        <span className={`tile sm fam-${fam}`}><KindIcon kind={kind} /></span>
        <b>New {label}</b>
        <code>{key}.‹name›</code>
      </div>
      {/* keyed on `initial`: a value that changes `existing` (and so `initial`, via uniqueName) while
          this step stays mounted must reseed the draft rather than leave a stale typed value behind */}
      <AddKeyRow key={initial} id={key} inputAriaLabel="Name" placeholder={initial} initial={initial} onDraft={setTyped}
        existing={existing} valid={(k) => pattern.re.test(k)} invalidText={`must match ${pattern.display}`}
        buttonText={`Add ${label}`} buttonAriaLabel={`Add ${label}`} buttonClassName="btn primary" onAdd={p.onAdd} />
      <p className="hint">{pattern.re === DNS_LABEL ? 'Lowercase letters, digits and dashes (DNS label).' : `Must match ${pattern.display}`}</p>
      <div className="preview">
        {valid ? (
          <>
            <div className="ph">Inserted from the schema example</div>
            <pre>{preview}</pre>
            <p className="hint">Names in references are placeholders; edit them in the inspector.</p>
          </>
        ) : (
          <pre>Type a valid name to preview the insert.</pre>
        )}
      </div>
      <div className="keys"><kbd>Enter</kbd> add <kbd>Esc</kbd> back</div>
    </div>
  );
}
