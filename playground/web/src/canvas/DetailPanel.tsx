import type { GraphNode } from '../graph/types';

export function DetailPanel({ node, onClose }: { node: GraphNode | null; onClose: () => void }) {
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
        <button onClick={() => navigator.clipboard.writeText(text)}>Copy</button>
        <button onClick={onClose} aria-label="close">
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
      <pre>{text}</pre>
    </aside>
  );
}
