import type { ReactElement } from 'react';
import type { EditOp, ValuesDocument } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { classify, resolve, type SchemaNode } from './schema';
import { buildFields, makeField } from './form';
import { FieldList, FieldRow } from './fields';
import type { InspectTarget } from './target';
import { OWNED_FLAGS } from '../graph/secondary';
import { RELEASE_TITLES, hiddenOnBasic } from './sections';
import { HiddenNote } from './HiddenNote';
import { isObj } from '../model/guards';

const RELEASE_SECTIONS = Object.keys(RELEASE_TITLES);
const hide = (x: string) => OWNED_FLAGS.has(x);

/** spec 2026-09-08 §3: the release-level sections (`generic`, `<kind>General`, `secretRefs`). */
export function ReleasePanel(p: {
  target: Extract<InspectTarget, { kind: 'release' }>; root: SchemaNode; doc: ValuesDocument; tier: Tier; disabled: boolean;
  onEdit: (ops: EditOp[]) => void; onTier: (t: Tier) => void;
}): ReactElement {
  const rootValue = p.doc.valueAt([]);
  const all = (isObj(rootValue) ? rootValue : {}) as Record<string, unknown>;

  // Property-shaped release sections list their fields; `secretRefs` is a bare additionalProperties
  // map that buildFields cannot walk, so it renders through its own widget.
  const releaseSection = (k: string): ReactElement => {
    const node = resolve(p.root, p.root.properties[k]);
    const widget = classify(p.root, node);
    if (widget.kind === 'object') return <FieldList root={p.root} node={node} basePath={[k]} value={all[k]} tier={p.tier} onEdit={p.onEdit} hide={hide} />;
    return <FieldRow root={p.root} field={makeField(p.root, k, [k], node, all[k])} tier={p.tier} onEdit={p.onEdit} bare />;
  };

  const hidden: string[] = [];
  const secs = RELEASE_SECTIONS.map((k) => {
    const node = resolve(p.root, p.root.properties[k]);
    const widget = classify(p.root, node);
    if (widget.kind === 'object') {
      const count = (tier: Tier) => buildFields(p.root, node, [k], all[k], tier, { hide }).length;
      if (hiddenOnBasic(count, p.tier)) {
        if (p.tier !== 'advanced' && !hiddenOnBasic(count, 'advanced')) hidden.push(RELEASE_TITLES[k]);
        return null;
      }
    }
    const bareBlock = widget.kind !== 'object' && all[k] !== undefined;
    return (
      <div key={k} className="sec">
        <h3>
          {RELEASE_TITLES[k]} <span className="k">{k}</span>
          {bareBlock && <button type="button" className="clear more" aria-label={`clear ${k}`} title="Remove this block from values.yaml" onClick={() => p.onEdit([{ op: 'delete', path: [k] }])}>×</button>}
        </h3>
        {releaseSection(k)}
      </div>
    );
  });
  return <fieldset disabled={p.disabled}>{secs}<HiddenNote names={hidden} onShow={() => p.onTier('advanced')} /></fieldset>;
}
