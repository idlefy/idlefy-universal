import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { splitManifests } from '../src/engine/split';
import type { Manifest } from '../src/engine/types';

const dir = path.resolve(__dirname, '..', 'src', 'graph', '__fixtures__');

/** Splits `helm template` output by its `# Source:` markers so each manifest keeps its templatePath. */
export function loadFixture(name: string): { manifests: Manifest[]; values: any } {
  const text = fs.readFileSync(path.join(dir, `${name}.yaml`), 'utf8');
  const values = parse(fs.readFileSync(path.join(dir, `${name}.values.yaml`), 'utf8'));
  const byTemplate = new Map<string, string[]>();
  for (const chunk of text.split(/^---$/m)) {
    const m = chunk.match(/^# Source: (\S+)/m);
    if (!m) continue;
    const list = byTemplate.get(m[1]) ?? [];
    list.push(chunk);
    byTemplate.set(m[1], list);
  }
  const manifests: Manifest[] = [];
  for (const [templatePath, chunks] of byTemplate) manifests.push(...splitManifests(templatePath, chunks.join('\n---\n')));
  return { manifests, values };
}
