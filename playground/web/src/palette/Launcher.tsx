import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import type { SchemaNode } from '../inspector/schema';
import { KindIcon } from '../canvas/icons';
import { familyOf } from '../graph/labels';
import { ENTITIES, entityOf, type Entity } from '../graph/entities';
import { NameStep } from './NameStep';

const matches = (e: Entity, q: string): boolean => !q || [e.label, e.key, e.kind, e.description].some((s) => s.toLowerCase().includes(q));
const GROUPS: { id: Entity['group']; heading: string }[] = [{ id: 'workloads', heading: 'WORKLOADS' }, { id: 'resources', heading: 'RESOURCES' }];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep Tab inside the popover: it is `aria-modal`, and the page behind it is not reachable by keyboard. */
function trapTab(ev: React.KeyboardEvent): void {
  const items = Array.from((ev.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(FOCUSABLE));
  if (items.length === 0) return;
  ev.preventDefault();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next = ev.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === -1 || i === items.length - 1 ? 0 : i + 1);
  items[next].focus();
}

/**
 * The Add launcher popover (spec §3): step 1 searches the entity table, step 2 (`NameStep`) names the
 * entry. Both steps live in the same 344 px dialog so it never moves. Closing on outside click and
 * returning focus to the trigger are the owner's job (`AddButton`).
 */
export function Launcher(p: { root: SchemaNode; values: Record<string, unknown>; initialKey?: string; onAdd: (key: string, name: string) => void; onClose: () => void }): ReactElement {
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Entity | null>(() => (p.initialKey ? entityOf(p.initialKey) ?? null : null));
  const shown = query.trim();
  const q = shown.toLowerCase();
  const filtered = useMemo(() => ENTITIES.filter((e) => matches(e, q)), [q]);
  const cur = Math.min(active, Math.max(0, filtered.length - 1));
  const list = useRef<HTMLDivElement>(null);
  // 'key' means the next active-row change came from a keyboard move and should scroll into view;
  // mount, a query edit that shifts `cur`, and mouse hover all leave it 'mouse' so hovering a
  // partially clipped row never rescrolls the list out from under the pointer.
  const modality = useRef<'key' | 'mouse'>('mouse');
  // The list is a 440 px scroll container over ~489 px of rows, so a keyboard move can land the
  // active row off-screen. jsdom has no layout and no scrollIntoView (GroupPanel guards it the same way).
  useEffect(() => {
    if (modality.current !== 'key') return;
    modality.current = 'mouse';
    list.current?.querySelector<HTMLElement>('.row.active')?.scrollIntoView?.({ block: 'nearest' });
  }, [cur, q, picked]);
  const choose = (e: Entity) => setPicked(e);
  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'Tab') { trapTab(ev); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); if (picked) setPicked(null); else p.onClose(); return; }
    if (picked || filtered.length === 0) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); modality.current = 'key'; setActive((cur + 1) % filtered.length); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); modality.current = 'key'; setActive((cur - 1 + filtered.length) % filtered.length); }
    else if (ev.key === 'Enter') { ev.preventDefault(); choose(filtered[cur]); }
  };
  const overRow = (i: number) => { modality.current = 'mouse'; setActive(i); };
  // Only a row or a group heading may steal the mousedown default (it would otherwise move focus to
  // the dialog, the nearest focusable ancestor, and silently stop the search box from filtering).
  // Anywhere else — the preview `<pre>`, a row's `<code>` key, the key-hint footer — a mousedown must
  // stay free to start a text selection.
  const onMouseDown = (ev: React.MouseEvent) => { if ((ev.target as HTMLElement).closest('.row, .lh')) ev.preventDefault(); };
  return (
    <div role="dialog" aria-modal="true" aria-label="Add a resource" className="launcher" tabIndex={-1} onKeyDown={onKeyDown} onMouseDown={onMouseDown}>   {/* tabIndex: keys keep working after a click on a non-focusable child (the preview) */}
      {picked ? (
        <NameStep key={picked.key} root={p.root} entity={picked} values={p.values} onBack={() => setPicked(null)} onAdd={(name) => p.onAdd(picked.key, name)} />
      ) : (
        <>
          <input className="in search" type="text" autoFocus role="combobox" aria-label="Search resources"
            aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={filtered.length > 0 ? optId(cur) : undefined}
            placeholder="Search resources…" value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }} />
          {filtered.length === 0 && <p className="none">No resource matches "{shown}"</p>}
          <div ref={list} id={listId} role="listbox" aria-label="Resources" className="list">
            {GROUPS.map(({ id, heading }) => {
              const rows = filtered.filter((e) => e.group === id);
              if (rows.length === 0) return null;
              return (
                <div key={id} role="group" aria-label={heading}>
                  <div className="lh">{heading}</div>
                  {rows.map((e) => {
                    const i = filtered.indexOf(e);
                    return (
                      <div key={e.key} id={optId(i)} role="option" aria-selected={i === cur} className={`row ${i === cur ? 'active' : ''}`}
                        onMouseEnter={() => overRow(i)} onMouseMove={() => overRow(i)} onClick={() => choose(e)}>
                        <span className={`tile sm fam-${familyOf(e.kind)}`}><KindIcon kind={e.kind} /></span>
                        <span className="txt"><b>{e.label}</b><span className="desc">{e.description}</span></span>
                        <code>{e.key}</code>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="keys"><kbd>↑↓</kbd> move <kbd>Enter</kbd> choose <kbd>Esc</kbd> close</div>
        </>
      )}
    </div>
  );
}
