import { parseAllDocuments } from 'yaml';
import type { KubeObject, Manifest } from './types';

/** Throws when a rendered document is not valid YAML; the message is prefixed with `templatePath`. */
export function splitManifests(templatePath: string, text: string): Manifest[] {
  const out: Manifest[] = [];
  for (const doc of parseAllDocuments(text)) {
    if (doc.errors.length > 0) throw new Error(`${templatePath}: ${doc.errors[0].message}`);
    const obj = doc.toJS() as unknown;
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Partial<KubeObject>;
    if (typeof o.kind !== 'string' || !o.metadata || typeof o.metadata.name !== 'string') continue;
    const [start, , end] = doc.range ?? [0, 0, 0];
    out.push({ templatePath, docIndex: out.length, raw: text.slice(start, end).trim(), obj: o as KubeObject });
  }
  return out;
}
