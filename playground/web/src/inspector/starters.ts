import type { SchemaNode } from './schema';

/**
 * A string the node's own `pattern` accepts, for the five patterns `values.schema.json` leaves
 * without `examples` or `default` — the schema cannot answer "what is a legal value here", so this
 * table does. Keyed by the pattern source, not by owner: `ContainerSpec.env[].name` and
 * `SecretRefEntry.name` share one pattern, six ServiceMonitor keys share another, and a new node
 * carrying a known pattern is covered for free. `test/starter-contract.test.ts` asserts every entry
 * matches its own key and that no pattern in the schema is missing from this table.
 */
export const PATTERN_STARTERS: Readonly<Record<string, string>> = {
  '^[A-Za-z_][A-Za-z0-9_]*$': 'MY_VAR',                                                    // EnvVar.name, SecretRefEntry.name
  '^\\S+\\s+\\S+\\s+\\S+\\s+\\S+\\s+\\S+$': '0 3 * * *',                                   // CronJobSpec.schedule
  '^([0-9]+(ms|s|m|h))+$': '30s',                                                          // ServiceMonitor interval / scrapeTimeout
  '^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$': 'api',             // IngressHost.subdomain
  '^[0-9]+(Ei|Pi|Ti|Gi|Mi|Ki|E|P|T|G|M|K)?$': '1Gi',                                       // PvcSpec.size
};

/**
 * The starter for a Kubernetes IntOrString node (`oneOf: [{type: integer}, {type: string, pattern:
 * '^[0-9]+%$'}]`), which has no `type` of its own. Always at least 1: `PdbConfig`'s integer branch
 * declares `minimum: 0`, and Go templates treat 0 as falsy, so `_autocreate-pdb.tpl` would emit
 * neither minAvailable nor maxUnavailable and render a PodDisruptionBudget with an empty spec.
 */
export function intOrStringStarter(node: SchemaNode): number {
  const alts: SchemaNode[] = Array.isArray(node.oneOf) ? node.oneOf : Array.isArray(node.anyOf) ? node.anyOf : [];
  const numeric = alts.find((a) => a && (a.type === 'integer' || a.type === 'number'));
  const min = numeric && typeof numeric.minimum === 'number' ? numeric.minimum : 1;
  return min >= 1 ? min : 1;
}

/**
 * `_validation.tpl`'s `computedIngressHost` fails with "Global domain must be specified when a
 * subdomain is used." unless `generic.ingressesGeneral.domain` is set, which a from-scratch document
 * never has — but both hostname `$defs` use `subdomain` in their examples. Rewrite it to the
 * explicit-host branch. Mutates in place; `starterValue` only ever passes it a fresh deep clone.
 */
const subdomainToHost = (v: Record<string, any>): void => {
  if (typeof v.subdomain === 'string' && v.host === undefined) {
    v.host = `${v.subdomain}.example.com`;
    delete v.subdomain;
  }
};

/** Corrections to a schema example, keyed by `$defs` name — applied by `starterValue`, so every
 *  insertion point gets them: the palette, an inspector "Add" chip, an object-list "add item". */
export const REF_FIXUPS: Readonly<Record<string, (v: Record<string, any>) => void>> = {
  IngressHost: subdomainToHost,
  HttpRouteHostname: subdomainToHost,
};

/**
 * Name-aware corrections applied on top of the starter body for a whole top-level entry, keyed by
 * the values key — these need the name the user chose, so they cannot live in `REF_FIXUPS`.
 * Applied only by `starterBody` (`src/palette/add.ts`); every other key inserts the schema example
 * as-is. `test/engine-node.test.ts` renders all eleven.
 */
export const ENTITY_FIXUPS: Readonly<Record<string, (body: Record<string, any>, name: string) => void>> = {
  // The example sets autoCreateService: true but has no port, so no Service would render and the group panel would show the switch on-but-blocked.
  deployments: (b) => { b.containers ??= {}; b.containers.main ??= {}; b.containers.main.ports = { http: { containerPort: 8080 } }; },
  // `selector: {app: external}` matches nothing and produces a synthetic selector node plus a warning.
  services: (b, name) => { b.selector = { app: name }; },
  // Mirrors what secondary.ts writes for the auto-created ingress; REF_FIXUPS has already turned the
  // example's subdomain into a host, this narrows it to the entity's own name.
  ingresses: (b, name) => { b.hosts = [{ host: `${name}.example.com`, paths: [{ path: '/', pathType: 'Prefix' }] }]; delete b.tls; },
  httpRoutes: (b, name) => { b.hostnames = [{ host: `${name}.example.com` }]; },
};

/** Starters for string leaves whose only constraint is `minLength` — no `pattern`, no `examples`/
 *  `default` of their own, and structurally identical to one another, so they can only be keyed by
 *  position. Keyed by `<$defs name>.<property path>` (`[]` = that property's `items`), the way
 *  REF_FIXUPS is keyed by `$defs` name; the keys are resolved to node identities once per root,
 *  which is exact because `resolve()` copies a node only when it carries `$ref` or `allOf` and both
 *  copies keep the same child `properties` objects. A key that stops resolving fails the contract
 *  test rather than silently falling back to ''. */
export const LEAF_STARTERS: Readonly<Record<string, string>> = {
  'HostAlias.ip': '10.0.0.1',
  'HostAlias.hostnames[]': 'legacy-db.internal',
  'IngressPath.path': '/',
};

const leafIndex = new WeakMap<SchemaNode, Map<SchemaNode, string>>();
/** `LEAF_STARTERS` resolved against one schema root: node identity → starter. */
export function leafStarters(root: SchemaNode): Map<SchemaNode, string> {
  const cached = leafIndex.get(root);
  if (cached) return cached;
  const m = new Map<SchemaNode, string>();
  for (const [key, value] of Object.entries(LEAF_STARTERS)) {
    const [defName, ...rest] = key.split('.');
    let node: SchemaNode | undefined = (root.$defs as Record<string, SchemaNode> | undefined)?.[defName];
    for (const seg of rest) {
      const prop = seg.endsWith('[]') ? seg.slice(0, -2) : seg;
      node = node?.properties?.[prop] as SchemaNode | undefined;
      if (seg.endsWith('[]')) node = node?.items as SchemaNode | undefined;
    }
    if (node) m.set(node, value);
  }
  leafIndex.set(root, m);
  return m;
}

export function stringStarter(root: SchemaNode, r: SchemaNode): string {
  if (typeof r.pattern === 'string') return PATTERN_STARTERS[r.pattern] ?? '';
  return leafStarters(root).get(r) ?? '';
}
