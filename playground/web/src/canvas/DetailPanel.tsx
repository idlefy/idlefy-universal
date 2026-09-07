import type { GraphNode } from '../graph/types';
import type { EditOp, ValuesDocument } from '../model/ValuesDocument';
import type { DetailTab, Tier } from '../app/state';
import type { SchemaNode } from '../inspector/schema';
import { Inspector } from '../inspector/Inspector';
import { KindIcon } from './icons';

export function DetailPanel(p: {
  node: GraphNode | null; tab: DetailTab; tier: Tier; doc: ValuesDocument; root: SchemaNode; disabled: boolean; nodes: GraphNode[];
  onTab: (t: DetailTab) => void; onTier: (t: Tier) => void; onEdit: (ops: EditOp[]) => void; onClose: () => void; onHide: () => void; onSelect: (id: string) => void;
}) {
  const { node } = p;
  if (!node) return null;
  // A node can lack a manifest in three ways: it is external (referenced only), it is the
  // synthetic Release node, or it is created at runtime by another resource (a Certificate's Secret).
  const text =
    node.manifest?.raw ??
    (node.external ? `# ${node.kind}/${node.name} is referenced by this release but not created by it.`
      : node.kind === 'Release' ? '# release-level settings'
        : `# ${node.kind}/${node.name} is created at runtime by another resource in this release.`);
  const line = node.provenance ? p.doc.lineOf(node.provenance.path) : null;
  const pathText = node.provenance ? (node.provenance.path.length ? node.provenance.path.join('.') : '(root)') : null;
  return (
    <aside className="detail">
      <div className="head">
        <KindIcon kind={node.kind} className={`fam-${node.family}`} />
        <div className="ttl">
          <b>{node.kind === 'Release' ? 'Release settings' : node.name}</b>
          {node.kind !== 'Release' && <span className="kind">{node.kind}</span>}
          <div className="meta" title={node.provenance?.governingCondition}>
            <span>namespace {node.namespace || '(none)'}</span>
            {pathText && <><span>·</span><code>{pathText}</code></>}
            {line && <><span>·</span><span>line {line}</span></>}
          </div>
          {node.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
        </div>
        <div className="acts">
          <button type="button" className="icon-btn" onClick={p.onHide} aria-label="Hide the inspector" title="Hide the inspector">›</button>
          <button type="button" className="icon-btn" onClick={p.onClose} aria-label="close" title="Deselect">×</button>
        </div>
      </div>
      <div className="bar">
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={p.tab === 'inspector'} onClick={() => p.onTab('inspector')}>Fields</button>
          <button type="button" role="tab" aria-selected={p.tab === 'yaml'} onClick={() => p.onTab('yaml')}>Manifest</button>
        </div>
        {p.tab === 'inspector' && (
          <label className="showall">
            <input type="checkbox" aria-label="show all fields" checked={p.tier === 'advanced'} onChange={(e) => p.onTier(e.target.checked ? 'advanced' : 'basic')} />
            show all fields
          </label>
        )}
      </div>
      <div className="body">
        {p.tab === 'inspector' ? (
          <Inspector node={node} root={p.root} doc={p.doc} tier={p.tier} onEdit={p.onEdit} disabled={p.disabled} nodes={p.nodes} onSelect={p.onSelect} />
        ) : (
          <div className="manifest">
            <button type="button" className="btn small" onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}>Copy manifest</button>
            <pre>{text}</pre>
          </div>
        )}
      </div>
    </aside>
  );
}
