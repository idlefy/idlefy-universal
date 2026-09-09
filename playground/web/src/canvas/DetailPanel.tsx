import type { ReactElement } from 'react';
import type { GraphNode } from '../graph/types';
import type { EditOp, ValuesDocument, ValuesPath } from '../model/ValuesDocument';
import type { DetailTab, Tier } from '../app/state';
import type { ResolvedSelection } from '../app/selection';
import type { SchemaNode } from '../inspector/schema';
import type { SecondaryId } from '../graph/secondary';
import { Inspector } from '../inspector/Inspector';
import { kindOfSecondary, plural } from '../inspector/summary';
import { familyOf } from '../graph/labels';
import { KindIcon, GroupGlyph } from './icons';

const manifestOf = (node: GraphNode): string =>
  node.manifest?.raw ??
  (node.external ? `# ${node.kind}/${node.name} is referenced by this release but not created by it.`
    : node.kind === 'Release' ? '# release-level settings'
      : `# ${node.kind}/${node.name} is created at runtime by another resource in this release.`);

export type Head = {
  fam: string; icon: ReactElement; name: string; kind: string | null; ns: string;
  path: ValuesPath | null; count?: number; manifest: string | null; tabs: readonly string[];
};

/** Header facts per selection shape. */
export function headOf(sel: ResolvedSelection): Head {
  if (sel.kind === 'group') {
    const { owner, members } = sel.group;
    return { fam: 'workload', icon: <GroupGlyph className="fam-workload" />, name: owner.name, kind: `${owner.kind} group`, ns: owner.namespace, path: owner.provenance?.path ?? null,
      count: members.length + 1, manifest: [owner, ...members].map(manifestOf).join('\n---\n'), tabs: ['Resources', 'Manifests'] };
  }
  if (sel.kind === 'block') {
    const kind = kindOfSecondary(String(sel.path[2]) as SecondaryId);
    return { fam: familyOf(kind), icon: <KindIcon kind={kind} className={`fam-${familyOf(kind)}`} />, name: sel.owner.name, kind, ns: sel.owner.namespace, path: sel.path, manifest: null, tabs: ['Fields'] };
  }
  const n = sel.node;
  return { fam: n.family, icon: <KindIcon kind={n.kind} className={`fam-${n.family}`} />, name: n.kind === 'Release' ? 'Release settings' : n.name, kind: n.kind === 'Release' ? null : n.kind, ns: n.namespace,
    path: n.provenance?.path ?? null, manifest: manifestOf(n), tabs: ['Fields', 'Manifest'] };
}

export function DetailPanel(p: {
  sel: ResolvedSelection | null; tab: DetailTab; tier: Tier; doc: ValuesDocument; root: SchemaNode; disabled: boolean; nodes: GraphNode[]; focusToken: number;
  onTab: (t: DetailTab) => void; onTier: (t: Tier) => void; onEdit: (ops: EditOp[]) => void; onClose: () => void; onHide: () => void; onSelect: (id: string) => void;
}): ReactElement | null {
  const { sel } = p;
  if (!sel) return null;
  const head = headOf(sel);
  const showAll = sel.kind !== 'group';
  const warnings = sel.kind === 'node' ? sel.node.warnings : [];
  const line = head.path ? p.doc.lineOf(head.path) : null;
  const pathText = head.path ? (head.path.length ? head.path.join('.') : '(root)') : null;
  const tab: DetailTab = head.manifest === null ? 'inspector' : p.tab;
  const title = sel.kind === 'node' ? sel.node.provenance?.governingCondition : undefined;
  return (
    <aside className={`detail fam-${head.fam}`}>
      <div className="head">
        <span className="tile">{head.icon}</span>
        <div className="ttl">
          <b>{head.name}</b>
          {head.kind && <span className="kind">{head.kind}</span>}
          <div className="meta" title={title}>
            <span>namespace {head.ns || '(none)'}</span>
            {pathText && <code>{pathText}</code>}
            {line && <span>line {line}</span>}
            {head.count !== undefined && <span>{plural(head.count, 'resource')}</span>}
          </div>
          {warnings.map((w) => <p key={w} className="warn">{w}</p>)}
        </div>
        <div className="acts">
          <button type="button" className="icon-btn" onClick={p.onHide} aria-label="Hide the inspector" title="Hide the inspector">›</button>
          <button type="button" className="icon-btn" onClick={p.onClose} aria-label="close" title="Deselect">×</button>
        </div>
      </div>
      <div className="bar">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'inspector'} onClick={() => p.onTab('inspector')}>{head.tabs[0]}</button>
          {head.tabs[1] && <button type="button" role="tab" aria-selected={tab === 'yaml'} onClick={() => p.onTab('yaml')}>{head.tabs[1]}</button>}
        </div>
        {tab === 'inspector' && showAll && (
          <label className="showall">
            <input type="checkbox" role="switch" className="switch sm" aria-label="show all fields" checked={p.tier === 'advanced'} onChange={(e) => p.onTier(e.target.checked ? 'advanced' : 'basic')} />
            Show all fields
          </label>
        )}
      </div>
      <div className="body">
        {tab === 'inspector' ? (
          <Inspector sel={sel} root={p.root} doc={p.doc} tier={p.tier} nodes={p.nodes} onEdit={p.onEdit} onSelect={p.onSelect} onTier={p.onTier} disabled={p.disabled} focusToken={p.focusToken} />
        ) : (
          <div className="manifest">
            <button type="button" className="btn small" onClick={() => navigator.clipboard?.writeText(head.manifest ?? '').catch(() => {})}>{sel.kind === 'group' ? 'Copy manifests' : 'Copy manifest'}</button>
            <pre>{head.manifest}</pre>
          </div>
        )}
      </div>
    </aside>
  );
}
