import type { ReactElement } from 'react';
import type { EditOp, ValuesDocument } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { classify, resolve, type SchemaNode } from './schema';
import { buildFields, makeField } from './form';
import { FieldList, FieldRow } from './fields';
import type { InspectTarget } from './target';
import { OWNED_FLAGS } from '../graph/secondary';
import { RELEASE_TITLES, hiddenTitle } from './sections';
import { HiddenNote } from './HiddenNote';
import { isObj } from '../model/guards';
import { secretRefUsers, subdomainUsers } from './summary';

const RELEASE_SECTIONS = Object.keys(RELEASE_TITLES);
const hide = (x: string) => OWNED_FLAGS.has(x);

/** The release-level sections (`generic`, `<kind>General`, `secretRefs`). */
export function ReleasePanel(p: {
  target: Extract<InspectTarget, { kind: 'release' }>; root: SchemaNode; doc: ValuesDocument; tier: Tier; disabled: boolean;
  onEdit: (ops: EditOp[]) => void; onTier: (t: Tier) => void;
}): ReactElement {
  const rootValue = p.doc.valueAt([]);
  const all = (isObj(rootValue) ? rootValue : {}) as Record<string, unknown>;

  // `generic.ingressesGeneral.domain` cannot express its own lock statically (chartRequired only
  // matches path shape): `_computed-ingress-host.tpl` needs it only while some `hosts[]`/`hostnames[]`
  // entry elsewhere in the document sets `subdomain`. ReleasePanel is the one caller with the whole
  // document in hand — same reasoning as the secretRefs guard just below — so it computes the lock
  // here and hands it down through buildFields' `lockedPaths` instead of TextField growing its own ×.
  const lockedPaths = subdomainUsers(all).length > 0 ? new Set(['generic.ingressesGeneral.domain']) : undefined;

  // Property-shaped release sections list their fields; `secretRefs` is a bare additionalProperties
  // map that buildFields cannot walk, so it renders through its own widget.
  const releaseSection = (k: string): ReactElement => {
    const node = resolve(p.root, p.root.properties[k]);
    const widget = classify(p.root, node);
    if (widget.kind === 'object') return <FieldList root={p.root} node={node} basePath={[k]} value={all[k]} tier={p.tier} onEdit={p.onEdit} hide={hide} lockedPaths={lockedPaths} />;
    // secretRefs is the one release block whose removal can break another resource: a container that
    // still lists the group renders "referenced secretRef '<g>' not found in .Values.secretRefs",
    // and removing the *last* group skips the chart's check entirely and dangles silently.
    const blockedRemove = k !== 'secretRefs' ? undefined : (group: string) => {
      const users = secretRefUsers(all, group);
      return users.length ? `used by ${users.join(', ')} — remove that reference first` : undefined;
    };
    return <FieldRow root={p.root} field={makeField(p.root, k, [k], node, all[k])} tier={p.tier} onEdit={p.onEdit} bare blockedRemove={blockedRemove} />;
  };

  // The section-level × deletes the whole `secretRefs` map in one click — every group, regardless of
  // whether a container still names it — bypassing the per-card guard entirely. It is blocked by the
  // same reasoning as the card's own ×: the first group any container still references, named the
  // same way (`secretRefUsers`, joined with ", ").
  const secretRefsBlockedReason = (): string | undefined => {
    const groups = all.secretRefs;
    if (!isObj(groups)) return undefined;
    for (const group of Object.keys(groups)) {
      const users = secretRefUsers(all, group);
      if (users.length) return `used by ${users.join(', ')} — remove that reference first`;
    }
    return undefined;
  };

  const hidden: string[] = [];
  const secs = RELEASE_SECTIONS.map((k) => {
    const node = resolve(p.root, p.root.properties[k]);
    const widget = classify(p.root, node);
    if (widget.kind === 'object') {
      const count = (tier: Tier) => buildFields(p.root, node, [k], all[k], tier, { hide }).length;
      const name = hiddenTitle(count, p.tier, RELEASE_TITLES[k]);
      if (name !== null) { if (name) hidden.push(name); return null; }
    }
    const bareBlock = widget.kind !== 'object' && all[k] !== undefined;
    const blockedReason = k === 'secretRefs' ? secretRefsBlockedReason() : undefined;
    return (
      <div key={k} className="sec">
        <h3>
          {RELEASE_TITLES[k]} <span className="k">{k}</span>
          {bareBlock && (
            <button type="button" className="clear more" aria-label={`clear ${k}`} disabled={!!blockedReason}
              title={blockedReason ?? 'Remove this block from values.yaml'}
              onClick={() => { if (!blockedReason) p.onEdit([{ op: 'delete', path: [k] }]); }}>×</button>
          )}
        </h3>
        {releaseSection(k)}
      </div>
    );
  });
  return <fieldset disabled={p.disabled}>{secs}<HiddenNote names={hidden} onShow={() => p.onTier('advanced')} /></fieldset>;
}
