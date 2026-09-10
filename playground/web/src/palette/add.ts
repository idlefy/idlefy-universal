import { stringify } from 'yaml';
import type { SchemaNode } from '../inspector/schema';
import { schemaAt } from '../inspector/schema';
import { starterValue } from '../inspector/form';
import { ENTITY_FIXUPS } from '../inspector/starters';
import type { EditOp } from '../model/ValuesDocument';

/** The values body inserted for a new `<key>.<name>`: the item schema's starter value (already
 *  carrying `REF_FIXUPS`) plus the key's name-aware `ENTITY_FIXUPS` correction. */
export function starterBody(root: SchemaNode, key: string, name: string): unknown {
  const node = schemaAt(root, [key, name]);
  const body = node ? starterValue(root, node) : {};
  if (body && typeof body === 'object' && !Array.isArray(body)) ENTITY_FIXUPS[key]?.(body as Record<string, any>, name);
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
