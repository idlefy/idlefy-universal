import examples from '../chart-bundle/examples.json';
import { DNS_LABEL } from '../graph/entities';

// helm accepts a DNS-1123 subdomain capped at 53 characters as a release name; a namespace is a
// plain DNS-1123 label. Neither is enforced by the chart's schema, and both end up in
// `app.kubernetes.io/instance` and in the copied install command.
const RELEASE_NAME = /^[a-z0-9]([-a-z0-9.]{0,51}[a-z0-9])?$/;
const badness = (ok: boolean, what: string) => (ok ? {} : { className: 'invalid', 'aria-invalid': true as const, title: what });

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
        {/* Controlled at "": the picker is a command, not a state display, so the same example can be re-picked to reset a wrecked document. */}
        <select className="examples" value="" onChange={(e) => e.target.value && p.onPickExample(e.target.value)} aria-label="examples">
          <option value="">Load example…</option>
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
        <label>release <input aria-label="release" value={p.release} onChange={(e) => p.onRelease(e.target.value)} size={8}
          {...badness(RELEASE_NAME.test(p.release), 'Lowercase letters, digits, dashes and dots, at most 53 characters.')} /></label>
        <label>namespace <input aria-label="namespace" value={p.ns} onChange={(e) => p.onNs(e.target.value)} size={8}
          {...badness(DNS_LABEL.test(p.ns), 'Lowercase letters, digits and dashes (DNS label).')} /></label>
      </div>
    </div>
  );
}
