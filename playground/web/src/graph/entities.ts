import type { SchemaNode } from '../inspector/schema';
import { resolve } from '../inspector/schema';
import { isObj } from '../model/guards';
import { WORKLOAD_KINDS } from './secondary';
// graph/ → inspector/schema is the reverse of the usual direction; there is no cycle (inspector/schema imports only model/), and the spec places this table in graph/.

/**
 * The one table of top-level values entities the palette can add. Menu order = table order.
 * Family (tile tint) is derived with `familyOf(kind)` from labels.ts; `expectations.ts` keeps
 * its own one-line standalone rules (spec §2) — test/entities.test.ts keeps the two in sync
 * by asserting this table equals the schema's `$ref`-bearing top-level maps.
 */
export type Entity = {
  key: string;                       // top-level values key
  label: string;                     // menu title
  kind: string;                      // manifest kind for the icon; 'ConfigMap' for configs (Secret is decided at render)
  group: 'workloads' | 'resources';
  description: string;               // one line, ≤ 40 chars
};

const workload = (key: string, description: string): Entity => ({ key, label: WORKLOAD_KINDS[key], kind: WORKLOAD_KINDS[key], group: 'workloads', description });
const resource = (key: string, label: string, kind: string, description: string): Entity => ({ key, label, kind, group: 'resources', description });

export const ENTITIES: readonly Entity[] = [
  workload('deployments', 'Stateless, long-running service'),
  workload('statefulSets', 'Stable identity and per-pod storage'),
  workload('daemonSets', 'One pod on every node'),
  workload('jobs', 'Runs to completion'),
  workload('cronJobs', 'Job on a schedule'),
  resource('configs', 'Config', 'ConfigMap', 'ConfigMap or Secret'),
  resource('services', 'Service', 'Service', 'Standalone Service'),
  resource('ingresses', 'Ingress', 'Ingress', 'HTTP routing to a Service'),
  resource('httpRoutes', 'HTTPRoute', 'HTTPRoute', 'Gateway API route'),
  resource('hpas', 'HPA', 'HorizontalPodAutoscaler', 'Autoscaler for an existing workload'),
  resource('persistentVolumeClaims', 'PVC', 'PersistentVolumeClaim', 'Persistent volume claim'),
];

export const entityOf = (key: string): Entity | undefined => ENTITIES.find((e) => e.key === key);

/** Kubernetes object names are DNS labels; used when the schema has no `propertyNames` for a map (spec §2). */
export const DNS_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

const topLevel = (root: SchemaNode, key: string): SchemaNode => resolve(root, root.properties?.[key] ?? {});

/** `re` is anchored for a whole-name test; `display` is the schema's own pattern text (never the
 *  `^(?:…)$` wrapper `re` needs internally) — the one copy shown to the user, in the hint and the
 *  invalid-name message. */
export type NamePattern = { re: RegExp; display: string };

export function namePattern(root: SchemaNode, key: string): NamePattern {
  const pat = topLevel(root, key).propertyNames?.pattern;
  // The chart's own pattern for the workload maps *is* the DNS label; `re === DNS_LABEL` lets a
  // caller tell "DNS label" from a bespoke pattern by identity (spec §3's hint copy).
  // A bespoke pattern is anchored: JSON Schema's `pattern` is a search, but `re.test(name)` here is
  // a whole-name check, and an unanchored regex would accept any name that merely contains a match.
  // The wrapper never leaks into `display`, though: the user asked to type something matching the
  // schema's pattern, not a regex source that happens to work with `re.test`.
  if (typeof pat === 'string' && pat !== DNS_LABEL.source) return { re: new RegExp(`^(?:${pat})$`), display: pat };
  return { re: DNS_LABEL, display: DNS_LABEL.source };
}

/** First key of the top-level map's `examples[0]`; every entity has one (asserted in tests). */
export function defaultName(root: SchemaNode, key: string): string {
  const ex = topLevel(root, key).examples?.[0];
  const first = isObj(ex) ? Object.keys(ex)[0] : undefined;
  return first ?? key;
}

export function uniqueName(base: string, existing: readonly string[]): string {
  if (!existing.includes(base)) return base;
  for (let i = 2; ; i++) { const n = `${base}-${i}`; if (!existing.includes(n)) return n; }
}
