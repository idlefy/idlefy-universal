import type { Manifest } from '../engine/types';
import type { Provenance } from './types';
import type { Expectation } from './expectations';

/**
 * Matches manifests to expectations by namespace/kind/name.
 * Disambiguation, in order:
 *  1. an expectation whose templateFile equals basename(manifest.templatePath) (HPA: hpa.yaml vs standalone-hpa.yaml);
 *  2. matchBy label (ServiceAccount);
 *  3. document order within a file: standalone expectations are consumed first (chart invariant for service/ingress/httproute/job).
 * `ns` is the release namespace used for manifests that carry no metadata.namespace; it must be the
 * same value that was passed to buildExpectations.
 */
export function attachProvenance(manifests: Manifest[], expectations: Expectation[], ns: string): { byManifest: Map<Manifest, Provenance | undefined>; unconsumed: Expectation[] } {
  const buckets = new Map<string, Expectation[]>();
  for (const e of expectations) {
    const k = `${e.namespace}/${e.kind}/${e.name}`;
    const list = buckets.get(k) ?? [];
    list.push(e);
    buckets.set(k, list);
  }
  for (const list of buckets.values()) list.sort((a, b) => Number(b.standalone) - Number(a.standalone));

  const ordered = [...manifests].sort((a, b) => a.templatePath.localeCompare(b.templatePath) || a.docIndex - b.docIndex);
  const byManifest = new Map<Manifest, Provenance | undefined>();
  for (const m of ordered) {
    const mns = m.obj.metadata.namespace ?? ns;
    const list = buckets.get(`${mns}/${m.obj.kind}/${m.obj.metadata.name}`) ?? [];
    const file = m.templatePath.split('/').pop();
    const labelOk = (e: Expectation) => !e.matchBy || m.obj.metadata.labels?.[e.matchBy.label] === e.matchBy.value;
    let idx = list.findIndex((e) => e.templateFile !== undefined && e.templateFile === file && labelOk(e));
    if (idx < 0) idx = list.findIndex((e) => e.templateFile === undefined && labelOk(e));
    if (idx < 0) { byManifest.set(m, undefined); continue; }
    const [e] = list.splice(idx, 1);
    byManifest.set(m, e.provenance);
  }
  const unconsumed = [...buckets.values()].flat();
  return { byManifest, unconsumed };
}
