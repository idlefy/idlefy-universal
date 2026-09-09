import type { ReactElement } from 'react';
import type { GraphNode } from '../graph/types';
import type { EditOp, ValuesDocument, ValuesPath } from '../model/ValuesDocument';
import type { Tier } from '../app/state';
import { groupId, type ResolvedSelection } from '../app/selection';
import { isWorkloadNode } from '../canvas/groups';
import { schemaAt, classify, resolve, type SchemaNode } from './schema';
import { buildFields, type Field } from './form';
import { FieldList, FieldRow } from './fields';
import { inspectTarget, type InspectTarget } from './target';
import { SECONDARY } from '../graph/secondary';
import { WORKLOAD_SECTIONS, RELEASE_TITLES, KIND_LABEL } from './sections';
import { Sections } from './Sections';
import { OwnerStrip } from './OwnerStrip';
import { GroupPanel } from './GroupPanel';
import { SecondaryPanel } from './SecondaryPanel';
import { HiddenNote } from './HiddenNote';
import { isObj, samePath } from '../model/guards';

const RELEASE_SECTIONS = ['generic', 'deploymentsGeneral', 'statefulSetsGeneral', 'daemonSetsGeneral', 'secretRefs'];
// Flags the switch list owns and the config blocks behind them: reached through the group panel, never as plain fields.
export const OWNED_FLAGS = new Set(SECONDARY.map((s) => `autoCreate${s.id[0].toUpperCase()}${s.id.slice(1)}`));
export const ALL_BLOCKS = new Set<string>(SECONDARY.map((s) => s.id));

export type InspectorProps = {
  sel: ResolvedSelection; root: SchemaNode; doc: ValuesDocument; tier: Tier; nodes: GraphNode[];
  onEdit: (ops: EditOp[]) => void; onSelect: (selection: string) => void; onTier: (t: Tier) => void; disabled: boolean; focusToken?: number;
};

export function Inspector(p: InspectorProps): ReactElement {
  const t: InspectTarget = inspectTarget(p.sel, p.root);
  const edit = p.disabled ? () => {} : p.onEdit;
  const rootValue = p.doc.valueAt([]);
  const all = (isObj(rootValue) ? rootValue : {}) as Record<string, unknown>;
  const notice = p.disabled && <p className="banner-inline">Fix the YAML syntax error in the editor to edit here.</p>;

  // spec 2026-09-08 §3.2: only the workload's own fields, with the group named above them
  const workloadPanel = (base: ValuesPath, name: string) => {
    const wl = p.nodes.find((n) => isWorkloadNode(n) && samePath(n.provenance!.path, base));
    const members = p.nodes.filter((n) => n.provenance?.owner && samePath(n.provenance.owner, base));
    const summary = members.length === 0 ? 'no other resources yet' : members.length === 1 ? members[0].kind : `${members[0].kind}, ${members.length - 1} more`;
    return (
      <>
        <OwnerStrip kind="group" text={<>In group <b>{name}</b> · {summary}</>} button="Open group" ariaLabel="open group" onClick={wl ? () => p.onSelect(groupId(wl.id)) : undefined} />
        <fieldset disabled={p.disabled}>
          <Sections root={p.root} node={schemaAt(p.root, base)!} base={base} value={p.doc.valueAt(base)} tier={p.tier} tables={WORKLOAD_SECTIONS}
            hide={(k) => OWNED_FLAGS.has(k) || ALL_BLOCKS.has(k)} onEdit={edit} onTier={p.onTier} />
        </fieldset>
      </>
    );
  };

  // Property-shaped release sections list their fields; `secretRefs` is a bare additionalProperties
  // map that buildFields cannot walk, so it renders through its own widget.
  const releaseSection = (k: string): ReactElement => {
    const node = resolve(p.root, p.root.properties[k]);
    const widget = classify(p.root, node);
    if (widget.kind === 'object') return <FieldList root={p.root} node={node} basePath={[k]} value={all[k]} tier={p.tier} onEdit={edit} hide={(x) => OWNED_FLAGS.has(x)} />;
    const field: Field = {
      key: k, path: [k], label: k, description: typeof node.description === 'string' ? node.description.trim() : undefined,
      widget, schema: node, value: all[k], present: all[k] !== undefined, required: false,
      tier: node['x-ui-tier'] === 'basic' ? 'basic' : 'advanced',
    };
    return <FieldRow root={p.root} field={field} tier={p.tier} onEdit={edit} bare />;
  };
  const releasePanel = () => {
    const hidden: string[] = [];
    const secs = RELEASE_SECTIONS.map((k) => {
      const node = resolve(p.root, p.root.properties[k]);
      const widget = classify(p.root, node);
      if (widget.kind === 'object') {
        const count = (tier: Tier) => buildFields(p.root, node, [k], all[k], tier, { hide: (x) => OWNED_FLAGS.has(x) }).length;
        if (count(p.tier) === 0) {
          // nothing on this tier: name it in the footer (spec §4.6) when the advanced tier would show something
          if (p.tier !== 'advanced' && count('advanced') > 0) hidden.push(RELEASE_TITLES[k] ?? k);
          return null;
        }
      }
      const bareBlock = widget.kind !== 'object' && all[k] !== undefined;
      return (
        <div key={k} className="sec">
          <h3>
            {RELEASE_TITLES[k] ?? k} <span className="k">{k}</span>
            {bareBlock && <button type="button" className="clear more" aria-label={`clear ${k}`} title="Remove this block from values.yaml" onClick={() => edit([{ op: 'delete', path: [k] }])}>×</button>}
          </h3>
          {releaseSection(k)}
        </div>
      );
    });
    return <fieldset disabled={p.disabled}>{secs}<HiddenNote names={hidden} onShow={() => p.onTier('advanced')} /></fieldset>;
  };

  let body: ReactElement;
  switch (t.kind) {
    case 'none': body = <p className="muted prov">{t.reason}</p>; break;
    case 'release': body = releasePanel(); break;
    case 'workload': body = workloadPanel(t.path, t.name); break;
    case 'group': body = <GroupPanel owner={t.owner} members={t.members} root={p.root} doc={p.doc} disabled={p.disabled} onEdit={edit} onSelect={p.onSelect} focusToken={p.focusToken ?? 0} />; break;
    case 'secondary': body = <SecondaryPanel target={t} root={p.root} doc={p.doc} tier={p.tier} nodes={p.nodes} disabled={p.disabled} onEdit={edit} onSelect={p.onSelect} onTier={p.onTier} />; break;
    case 'entity': {
      const owner = p.sel.kind === 'node' ? p.sel.node.provenance?.owner : undefined;
      body = (
        <>
          {owner && <p className="prov">Part of {KIND_LABEL[String(owner[0])] ?? owner[0]} {String(owner[1])} (values: <code>{t.path.join('.')}</code>).</p>}
          <fieldset disabled={p.disabled}>
            <div className="sec">
              <FieldList root={p.root} node={schemaAt(p.root, t.path)!} basePath={t.path} value={p.doc.valueAt(t.path)} tier={p.tier} onEdit={edit} />
            </div>
          </fieldset>
        </>
      );
      break;
    }
  }
  const bodyKey = t.kind === 'release' ? 'release' : t.kind === 'none' ? 'none' : t.kind === 'group' ? `group:${t.owner.id}` : t.path.join('.');
  return (
    <div className="inspector" key={bodyKey}>
      {notice}
      {body}
    </div>
  );
}
