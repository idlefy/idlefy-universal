// Shared harness for the edit-integrity suite. No tests live here: vitest boots one Go/WASM engine
// per *file*, so the spec files that import this each pay ~1.3 s of boot and then ~113 ms per render.
// `__dirname` below works under vitest's CJS-interop transform (test/engine-node.test.ts already
// relies on it) — do not "fix" it to `import.meta.url`.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect } from 'vitest';
import chartFiles from '../src/chart-bundle/chart.json';
import schema from '../src/chart-bundle/schema.json';
import { toRenderResult } from '../src/engine/client';
import type { EngineRawResult, RenderResult } from '../src/engine/types';
import { resolve, type SchemaNode } from '../src/inspector/schema';
import { buildFields, itemShape, type Field } from '../src/inspector/form';
import { OWNED_FLAGS, SEC_IDS } from '../src/graph/secondary';
import { type EditOp, type ValuesDocument, type ValuesPath } from '../src/model/ValuesDocument';
import { isObj } from '../src/model/guards';

export const root = schema as SchemaNode;

/** The workload keys the group panel owns: hidden from the field list, reached only through switches. */
export const workloadHide = (k: string) => OWNED_FLAGS.has(k) || SEC_IDS.has(k);

/**
 * Every `Field` the inspector can show under `node`, nested the way FieldList/Sections nest:
 * object → its properties, map → each entry, objectList → each row. Depth 2 (a row inside a map
 * inside a panel) is deeper than any shipped panel goes; `yaml` widgets are raw text, not fields.
 * `hide` is honoured at whichever level passes it: the panel's own level (like the real
 * WorkloadPanel), and — for an object-list row — the row's identifying key and its promoted leaves
 * (like `ObjectListField`'s own `hideLeaves`), never deeper than that one level. Those leaves are
 * edited directly as row inputs with their own eviction (`leafEditOps`, exercised separately below);
 * they never reach `buildFields`/`AddChips` in the real widget, so the sweep must not probe them
 * there either — `IngressHost`/`HttpRouteHostname`'s `subdomain` chip would need a global domain to
 * render, which no chip alone can provide, and is not a chip the real UI ever offers.
 * `lockedPaths` mirrors `buildFields`'s own option (the one runtime, document-wide lock — see its
 * doc comment): forwarded unchanged at every depth, exactly as `ReleasePanel` forwards it through
 * `FieldList`/`ObjectSection` in the real component tree.
 */
export function* walkFields(node: SchemaNode, basePath: ValuesPath, value: unknown, hide?: (k: string) => boolean, lockedPaths?: ReadonlySet<string>, depth = 0): Generator<Field> {
  if (depth > 2) return;
  for (const f of buildFields(root, node, basePath, value, 'advanced', { hide, lockedPaths })) {
    yield f;
    if (!f.present) continue;
    const r = resolve(root, f.schema);
    if (f.widget.kind === 'object') {
      yield* walkFields(f.schema, f.path, f.value, undefined, lockedPaths, depth + 1);
    } else if (f.widget.kind === 'map' && isObj(f.value)) {
      for (const [k, v] of Object.entries(f.value)) yield* walkFields(r.additionalProperties as SchemaNode, [...f.path, k], v, undefined, lockedPaths, depth + 1);
    } else if (f.widget.kind === 'objectList' && Array.isArray(f.value)) {
      const itemNode = r.items as SchemaNode;
      const rowShape = itemShape(root, itemNode);
      // mirrors ObjectListField.tsx's `hide = pair ? hideLeaves : undefined` (~line 120): a block row
      // shows every key in the UI, so only a pair row hides its identifying/leaf keys from the sweep.
      const hideRowLeaves = rowShape.pair ? (k: string) => k === rowShape.identifying || rowShape.leaves.some((l) => l[0] === k) : undefined;
      for (let i = 0; i < f.value.length; i++) yield* walkFields(itemNode, [...f.path, i], f.value[i], hideRowLeaves, lockedPaths, depth + 1);
    }
  }
}

const pub = path.resolve(__dirname, '..', 'public');
const wasmPath = path.join(pub, 'helm.wasm');
const filesJSON = JSON.stringify({ ...(chartFiles as Record<string, string>), 'values.schema.json': JSON.stringify(schema) });

/** Never skipped: scripts/bundle-chart.mjs (npm test's first step) refuses to run without helm.wasm. */
export async function bootEngine(): Promise<void> {
  const g = globalThis as any;
  if (g.helmRender) return;
  expect(fs.existsSync(wasmPath), `${wasmPath} is missing — run playground/engine/build.sh (make playground-engine)`).toBe(true);
  g.require = createRequire(import.meta.url);
  g.fs = fs;
  g.crypto ??= (await import('node:crypto')).webcrypto;
  await import(path.join(pub, 'wasm_exec.js'));
  const go = new g.Go();
  const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), go.importObject);
  void go.run(instance);
}

export function renderRaw(values: string): EngineRawResult {
  return JSON.parse((globalThis as any).helmRender(filesJSON, values, 'demo', 'default')) as EngineRawResult;
}

export const render = (values: string): RenderResult => toRenderResult(renderRaw(values), 0);

/**
 * `render(doc.toString())`, guarded against both ways `ValuesDocument` can lose an edit without ever
 * throwing: `toString()` falls back to `doc`'s pre-edit source when `yaml` cannot re-emit the edited
 * tree (e.g. deleting an anchored child whose alias lives elsewhere), and `setIn`/`deleteIn` bail on a
 * type-mismatched intermediate rather than throwing out of the edit. Either would otherwise render the
 * *unchanged* (or only partly changed) document — indistinguishable from a genuinely successful edit —
 * and let exactly the failure this sweep exists to catch pass silently. Report each as its own failure,
 * with its own `why()` text, instead.
 */
export function renderDoc(doc: ValuesDocument): RenderResult {
  const text = doc.toString();
  if (doc.stringifyFailed) return { ok: false, error: { kind: 'template', message: 'edit did not serialize' } };
  if (doc.bailed) return { ok: false, error: { kind: 'template', message: 'edit did not apply' } };
  return render(text);
}

/** `renderDoc(doc.apply(ops))` — the sweeps' most common shape, applying one edit and rendering it. */
export function applyRender(doc: ValuesDocument, ops: EditOp[]): RenderResult {
  return renderDoc(doc.apply(ops));
}

/**
 * One readable line per failure. A template failure arrives as a 5-line Go `include` chain whose only
 * useful part is after the last `error calling fail:`; a schema failure is a bullet list of `- at '…'`.
 */
export function why(r: RenderResult): string {
  if (r.ok) return '';
  const m = r.error.message;
  if (r.error.kind === 'schema') return m.split('\n').filter((l) => l.trim().startsWith('-')).join(' ; ').trim() || m;
  const i = m.lastIndexOf('error calling fail: ');
  return (i < 0 ? m : m.slice(i + 'error calling fail: '.length)).split('\n')[0].trim();
}

/** `EDIT_INTEGRITY=full npm test` adds the two sweeps that are too slow for every run (see each site). */
export const FULL = process.env.EDIT_INTEGRITY === 'full';

/** `EDIT_INTEGRITY=off npm test` skips the engine sweeps entirely — for a tight edit/run loop only.
 *  Never set in CI; the gate before every commit is the unset default. */
export const SKIP = process.env.EDIT_INTEGRITY === 'off';

/** Vitest's default 5 s timeout is far below one engine sweep; every engine `it` passes this. */
export const TIMEOUT = 300_000;

/** The smallest body each workload kind's schema accepts, plus one container port so the Service and
 *  ServiceMonitor switches are not blocked, and (for Job/CronJob) a `serviceAccountName` so `rbac` is
 *  not blocked either — JobSpec/CronJobSpec have no `autoCreateServiceAccount`, only `serviceAccountName`. */
export const MINIMAL: Record<string, Record<string, unknown>> = {
  deployments: { containers: { main: { image: 'nginx', imageTag: '1.27', ports: { http: { containerPort: 80 } } } } },
  statefulSets: { containers: { main: { image: 'postgres', imageTag: '16', ports: { http: { containerPort: 5432 } } } }, serviceName: 'app' },
  daemonSets: { containers: { main: { image: 'agent', imageTag: 'v1', ports: { http: { containerPort: 80 } } } } },
  jobs: { containers: { main: { image: 'worker', imageTag: 'v1' } }, serviceAccountName: 'app' },
  cronJobs: { containers: { main: { image: 'backup', imageTag: 'v1' } }, schedule: '0 0 * * *', serviceAccountName: 'app' },
};

/** Two instances of every entity with every toggle on: the only document that puts two Ingresses
 *  (and two HTTPRoutes) into one template's output, which is what glued `---` separators need.
 *  It renders successfully against the chart as it is today (only the whitespace *between* documents
 *  is wrong), which is what lets `chart-separators` assert `raw.ok` and then scan the output. */
export const KITCHEN_SINK = `
generic:
  ingressesGeneral: {domain: example.com}
deployments:
  a:
    containers: {main: {image: nginx, imageTag: "1", ports: {http: {containerPort: 80}}}}
    autoCreateService: true
    autoCreateIngress: true
    ingress: {hosts: [{host: a.example.com, paths: [{path: /, pathType: Prefix}]}]}
    autoCreateHttpRoute: true
    httpRoute: {parentRefs: [{name: gw}], hostnames: [{host: a.example.com}]}
    autoCreateCertificate: true
    certificate: {clusterIssuer: le}
    autoCreatePdb: true
    pdb: {maxUnavailable: 1}
    autoCreateServiceMonitor: true
    autoCreateNetworkPolicy: true
    networkPolicy: {policyTypes: [Ingress], ingress: []}
    autoCreateServiceAccount: true
    autoCreateRbac: true
    rbac: {rules: [{apiGroups: [""], resources: [configmaps], verbs: [get]}]}
    hpa: {minReplicas: 1, maxReplicas: 3}
    migrations: {enabled: true}
  b:
    containers: {main: {image: nginx, imageTag: "1", ports: {http: {containerPort: 80}}}}
    autoCreateService: true
    autoCreateIngress: true
    ingress: {hosts: [{host: b.example.com, paths: [{path: /, pathType: Prefix}]}]}
    autoCreateHttpRoute: true
    httpRoute: {parentRefs: [{name: gw}], hostnames: [{host: b.example.com}]}
    autoCreateCertificate: true
    certificate: {clusterIssuer: le}
    autoCreatePdb: true
    pdb: {maxUnavailable: 1}
    autoCreateServiceMonitor: true
    autoCreateNetworkPolicy: true
    networkPolicy: {policyTypes: [Ingress], ingress: []}
    autoCreateServiceAccount: true
    autoCreateRbac: true
    rbac: {rules: [{apiGroups: [""], resources: [configmaps], verbs: [get]}]}
    hpa: {minReplicas: 1, maxReplicas: 3}
    migrations: {enabled: true}
statefulSets:
  s1: {serviceName: s1, autoCreateService: true, autoCreatePdb: true, pdb: {maxUnavailable: 1}, autoCreateServiceAccount: true, autoCreateServiceMonitor: true, containers: {main: {image: pg, imageTag: "16", ports: {http: {containerPort: 5432}}}}}
  s2: {serviceName: s2, autoCreateService: true, autoCreatePdb: true, pdb: {maxUnavailable: 1}, autoCreateServiceAccount: true, autoCreateServiceMonitor: true, containers: {main: {image: pg, imageTag: "16", ports: {http: {containerPort: 5432}}}}}
daemonSets:
  d1: {autoCreatePdb: true, pdb: {maxUnavailable: 1}, autoCreateServiceAccount: true, autoCreateServiceMonitor: true, autoCreateNetworkPolicy: true, networkPolicy: {policyTypes: [Ingress], ingress: []}, containers: {main: {image: a, imageTag: v1, ports: {http: {containerPort: 80}}}}}
  d2: {autoCreatePdb: true, pdb: {maxUnavailable: 1}, autoCreateServiceAccount: true, autoCreateServiceMonitor: true, autoCreateNetworkPolicy: true, networkPolicy: {policyTypes: [Ingress], ingress: []}, containers: {main: {image: a, imageTag: v1, ports: {http: {containerPort: 80}}}}}
jobs:
  j1: {containers: {main: {image: w, imageTag: v1}}, autoCreateNetworkPolicy: true, networkPolicy: {policyTypes: [Ingress], ingress: []}}
  j2: {containers: {main: {image: w, imageTag: v1}}, autoCreateNetworkPolicy: true, networkPolicy: {policyTypes: [Ingress], ingress: []}}
cronJobs:
  c1: {schedule: "0 0 * * *", containers: {main: {image: b, imageTag: v1}}, autoCreateNetworkPolicy: true, networkPolicy: {policyTypes: [Ingress], ingress: []}}
  c2: {schedule: "0 0 * * *", containers: {main: {image: b, imageTag: v1}}, autoCreateNetworkPolicy: true, networkPolicy: {policyTypes: [Ingress], ingress: []}}
configs:
  cfg1: {type: configMap, data: {k: v}}
  cfg2: {type: secret, data: {k: v}}
services:
  sv1: {type: ClusterIP, selector: {app: a}, ports: [{name: http, port: 80, targetPort: 8080}]}
  sv2: {type: ClusterIP, selector: {app: b}, ports: [{name: http, port: 80, targetPort: 8080}]}
ingresses:
  i1: {hosts: [{host: i1.example.com, paths: [{path: /, pathType: Prefix}]}]}
  i2: {hosts: [{host: i2.example.com, paths: [{path: /, pathType: Prefix}]}]}
httpRoutes:
  h1: {parentRefs: [{name: gw}], hostnames: [{host: h1.example.com}], rules: [{matches: [{path: {type: PathPrefix, value: /}}], backendRefs: [{name: a, port: 80}]}]}
  h2: {parentRefs: [{name: gw}], hostnames: [{host: h2.example.com}], rules: [{matches: [{path: {type: PathPrefix, value: /}}], backendRefs: [{name: a, port: 80}]}]}
hpas:
  hp1: {scaleTargetRef: {kind: Deployment, name: a}, maxReplicas: 3, metrics: [{type: Resource, resource: {name: cpu, target: {type: Utilization, averageUtilization: 60}}}]}
  hp2: {scaleTargetRef: {kind: Deployment, name: b}, maxReplicas: 3, metrics: [{type: Resource, resource: {name: cpu, target: {type: Utilization, averageUtilization: 60}}}]}
persistentVolumeClaims:
  p1: {accessModes: [ReadWriteOnce], size: 1Gi}
  p2: {accessModes: [ReadWriteOnce], size: 1Gi}
`;
