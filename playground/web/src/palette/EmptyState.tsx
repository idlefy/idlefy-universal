import type { ReactElement } from 'react';

/** Shown on the canvas when the last successful render produced zero objects and the YAML has no errors (spec §7). */
export function EmptyState(p: { onAddDeployment: () => void; onLoadExample: () => void }): ReactElement {
  return (
    <div className="empty">
      <div className="empty-card">
        <div className="glyph" aria-hidden="true">＋</div>
        <h3>Nothing to render yet</h3>
        <p>Add a workload, or start from an example.</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={p.onAddDeployment}>Add a Deployment</button>
          <button type="button" className="btn" onClick={p.onLoadExample}>Load an example</button>
        </div>
        <p className="hint">values.yaml has no workloads, so the chart renders no objects.</p>
      </div>
    </div>
  );
}
