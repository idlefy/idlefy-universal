import type { GraphNode } from '../graph/types';
import type { EditOp, ValuesDocument } from '../model/ValuesDocument';
import type { DetailTab, Tier } from '../app/state';
import type { SchemaNode } from '../inspector/schema';
import { Inspector } from '../inspector/Inspector';

export function DetailPanel(p: {
  node: GraphNode | null;
  nodes: GraphNode[];
  tab: DetailTab;
  tier: Tier;
  doc: ValuesDocument;
  root: SchemaNode;
  disabled: boolean;
  onTab: (t: DetailTab) => void;
  onTier: (t: Tier) => void;
  onEdit: (ops: EditOp[]) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  onHide: () => void;
}) {
  const { node } = p;
  void p.onHide; // rendered by Task 10
  if (!node) return null;
  // A node can lack a manifest in three ways: it is external (referenced only), it is the
  // synthetic Release node, or it is created at runtime by another resource (a Certificate's Secret).
  const text =
    node.manifest?.raw ??
    (node.external
      ? `# ${node.kind}/${node.name} is referenced by this release but not created by it.`
      : node.kind === 'Release'
        ? '# release-level settings'
        : `# ${node.kind}/${node.name} is created at runtime by another resource in this release.`);
  return (
    <aside className="detail">
      <header>
        <strong>{node.kind}</strong> {node.name}
        {navigator.clipboard && (
          <button onClick={() => navigator.clipboard.writeText(text).catch(() => {})}>Copy</button>
        )}
        <button onClick={p.onClose} aria-label="close">
          ×
        </button>
      </header>
      <p className="ns">namespace: <code>{node.namespace || '(none)'}</code></p>
      {node.provenance && (
        <p className="prov">
          values: <code>{node.provenance.path.length ? node.provenance.path.join('.') : '(root)'}</code> ·{' '}
          {node.provenance.governingCondition}
        </p>
      )}
      {node.warnings.map((w) => (
        <p key={w} className="warn">
          {w}
        </p>
      ))}
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={p.tab === 'inspector'} onClick={() => p.onTab('inspector')}>
          Inspector
        </button>
        <button role="tab" aria-selected={p.tab === 'yaml'} onClick={() => p.onTab('yaml')}>
          YAML
        </button>
      </div>
      {p.tab === 'inspector' ? (
        <Inspector
          node={node}
          nodes={p.nodes}
          root={p.root}
          doc={p.doc}
          tier={p.tier}
          onTier={p.onTier}
          onEdit={p.onEdit}
          onSelect={p.onSelect}
          disabled={p.disabled}
        />
      ) : (
        <pre>{text}</pre>
      )}
    </aside>
  );
}
