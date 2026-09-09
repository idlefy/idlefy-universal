import type { ReactElement } from 'react';
import type { EditOp, ValuesPath } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { resolve, type SchemaNode } from './schema';
import { buildFields } from './form';
import { FieldList } from './fields';
import { partition, OTHER_SECTION, type Section } from './sections';
import { HiddenNote } from './HiddenNote';

/**
 * Titled sections over one object node's keys, in table order, unknown keys last under `other`
 * (default "Other"). Advanced sections on the basic tier do not render; their titles go to one
 * footer note (spec 2026-09-08 §4.6). A section with nothing to show on this tier is omitted.
 */
export function Sections(p: {
  root: SchemaNode; node: SchemaNode; base: ValuesPath; value: unknown; tier: Tier; tables: readonly Section[]; other?: Section;
  hide?: (key: string) => boolean; onEdit: (ops: EditOp[]) => void; onTier: (t: Tier) => void;
}): ReactElement {
  const keys = Object.keys(resolve(p.root, p.node).properties ?? {}).filter((k) => !p.hide?.(k));
  const parts = partition(keys, p.tables).map((x) => (x.section === OTHER_SECTION && p.other ? { ...x, section: p.other } : x));
  const hidden: string[] = [];
  const rendered = parts.map(({ section, keys: mine }) => {
    // a section flagged advanced is gated behind the tier switch as a whole, even when one of its
    // fields happens to carry x-ui-tier basic (deployments.nodeSelector inside Placement & security)
    if (section.advanced && p.tier !== 'advanced') { hidden.push(section.title); return null; }
    const set = new Set(mine);
    const hide = (k: string) => !set.has(k);
    const count = (tier: Tier) => buildFields(p.root, p.node, p.base, p.value, tier, { hide }).length;
    if (count(p.tier) === 0) {
      // nothing on this tier: name it in the footer (spec §4.6) when the advanced tier would show something
      // (release panel's rule, mirrored here for a non-advanced-flagged section like workload Metadata)
      if (p.tier !== 'advanced' && count('advanced') > 0) hidden.push(section.title);
      return null;
    }
    return (
      <div key={section.id} className="sec">
        <h3>{section.title}</h3>
        <FieldList root={p.root} node={p.node} basePath={p.base} value={p.value} tier={p.tier} onEdit={p.onEdit} hide={hide} order={mine} />
      </div>
    );
  });
  return <>{rendered}<HiddenNote names={hidden} onShow={() => p.onTier('advanced')} /></>;
}
