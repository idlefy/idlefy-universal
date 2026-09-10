import examples from '../chart-bundle/examples.json';
import { DNS_LABEL } from '../graph/entities';

// helm accepts a DNS-1123 subdomain capped at 53 characters as a release name; a namespace is a
// plain DNS-1123 label. Neither is enforced by the chart's schema, and both end up in
// `app.kubernetes.io/instance` and in the copied install command.
//
// A DNS-1123 *subdomain* is one or more DNS-1123 labels joined by dots — each label on its own must
// start and end with a letter or digit (`DNS_LABEL`), so a single regex over the whole string with a
// `.` thrown into its character class (the previous shape here) is too permissive: it accepts
// `a..b`/`a-.b`, where an empty or dash-bounded label sits between two dots. Split and check every
// label instead.
const RELEASE_NAME_TITLE = 'Lowercase letters, digits, dashes and dots; each dot-separated part must start and end with a letter or digit; at most 53 characters.';
const isReleaseName = (v: string): boolean => v.length > 0 && v.length <= 53 && v.split('.').every((label) => DNS_LABEL.test(label));
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
          {...badness(isReleaseName(p.release), RELEASE_NAME_TITLE)} /></label>
        <label>namespace <input aria-label="namespace" value={p.ns} onChange={(e) => p.onNs(e.target.value)} size={8}
          {...badness(DNS_LABEL.test(p.ns), 'Lowercase letters, digits and dashes (DNS label).')} /></label>
      </div>
    </div>
  );
}
