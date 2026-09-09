import examples from '../chart-bundle/examples.json';

export function Toolbar(p: {
  release: string; ns: string; onRelease: (s: string) => void; onNs: (s: string) => void;
  onPickExample: (id: string) => void; valuesText: string; chartVersion: string; onHide: () => void;
}) {
  const install = `helm install ${p.release} oci://ghcr.io/idlefy/idlefy-universal --version ${p.chartVersion} -n ${p.ns} -f values.yaml`;
  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});
  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <button type="button" className="icon-btn" onClick={p.onHide} aria-label="Hide values.yaml" title="Hide values.yaml">‹</button>
        <select className="examples" defaultValue="" onChange={(e) => e.target.value && p.onPickExample(e.target.value)} aria-label="examples">
          <option value="" disabled>Load example…</option>
          {(examples as { id: string; label: string }[]).map((ex) => <option key={ex.id} value={ex.id} title={ex.label}>{ex.id} — {ex.label}</option>)}
        </select>
        {navigator.clipboard && (
          <>
            <button type="button" className="btn" onClick={() => copy(p.valuesText)} title="Copy values.yaml">Copy YAML</button>
            <button type="button" className="btn" onClick={() => copy(install)} title={install}>Copy install</button>
          </>
        )}
      </div>
      <div className="toolbar-row muted">
        <label>release <input value={p.release} onChange={(e) => p.onRelease(e.target.value)} size={8} /></label>
        <label>namespace <input value={p.ns} onChange={(e) => p.onNs(e.target.value)} size={8} /></label>
      </div>
    </div>
  );
}
