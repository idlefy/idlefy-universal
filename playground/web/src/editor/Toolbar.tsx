import examples from '../chart-bundle/examples.json';

export function Toolbar(p: { release: string; ns: string; onRelease: (s: string) => void; onNs: (s: string) => void; onPickExample: (id: string) => void; valuesText: string; chartVersion: string }) {
  const install = `helm install ${p.release} oci://ghcr.io/idlefy/idlefy-universal --version ${p.chartVersion} -n ${p.ns} -f values.yaml`;
  return (
    <div className="toolbar">
      <select defaultValue="" onChange={(e) => e.target.value && p.onPickExample(e.target.value)} aria-label="examples">
        <option value="" disabled>Load example…</option>
        {(examples as { id: string; label: string }[]).map((ex) => <option key={ex.id} value={ex.id}>{ex.id} — {ex.label}</option>)}
      </select>
      <label>release <input value={p.release} onChange={(e) => p.onRelease(e.target.value)} size={8} /></label>
      <label>ns <input value={p.ns} onChange={(e) => p.onNs(e.target.value)} size={8} /></label>
      <button onClick={() => navigator.clipboard.writeText(p.valuesText)}>Copy values.yaml</button>
      <button title={install} onClick={() => navigator.clipboard.writeText(install)}>Copy install command</button>
    </div>
  );
}
