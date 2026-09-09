import { stringify } from 'yaml';
import type { SchemaNode } from '../inspector/schema';
import { schemaAt } from '../inspector/schema';
import { starterValue } from '../inspector/form';
import type { EditOp } from '../model/ValuesDocument';

type Body = Record<string, any>;

/**
 * Name-aware corrections to the schema examples. Schema validity does not imply template success:
 * the chart's _validation.tpl fails a render when an Ingress/HTTPRoute host is given as `subdomain`
 * without `generic.ingressesGeneral.domain`, which a from-scratch document never has (spec §4).
 * Every other key inserts examples[0] untouched; test/engine-node.test.ts renders all eleven.
 */
const FIXUPS: Record<string, (body: Body, name: string) => void> = {
  // The example sets autoCreateService: true but has no port, so no Service would render and the group panel would show the switch on-but-blocked.
  deployments: (b) => { b.containers ??= {}; b.containers.main ??= {}; b.containers.main.ports = { http: { containerPort: 8080 } }; },
  // `selector: {app: external}` matches nothing and produces a synthetic selector node plus a warning.
  services: (b, name) => { b.selector = { app: name }; },
  // Mirrors what secondary.ts writes for the auto-created ingress.
  ingresses: (b, name) => { b.hosts = [{ host: `${name}.example.com`, paths: [{ path: '/', pathType: 'Prefix' }] }]; delete b.tls; },
  httpRoutes: (b, name) => { b.hostnames = [{ host: `${name}.example.com` }]; },
};

/** The values body inserted for a new `<key>.<name>`: the item schema's starter value plus the key's fixup. */
export function starterBody(root: SchemaNode, key: string, name: string): unknown {
  const node = schemaAt(root, [key, name]);
  const body = node ? starterValue(root, node) : {};
  if (body && typeof body === 'object' && !Array.isArray(body)) FIXUPS[key]?.(body as Body, name);
  return body;
}

export function addEntityOps(root: SchemaNode, key: string, name: string): EditOp[] {
  return [{ op: 'set', path: [key, name], value: starterBody(root, key, name) }];
}

export const PREVIEW_LINES = 12;

/** The YAML the insert will produce, cut to PREVIEW_LINES with a trailing `…` line. */
export function previewYaml(key: string, name: string, body: unknown): string {
  const lines = stringify({ [key]: { [name]: body } }, { lineWidth: 0 }).trimEnd().split('\n');
  return lines.length > PREVIEW_LINES ? [...lines.slice(0, PREVIEW_LINES), '…'].join('\n') : lines.join('\n');
}
