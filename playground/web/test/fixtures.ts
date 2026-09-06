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
    // production's raw manifest text never carries the helm-injected `# Source:` header, so
    // strip it here too, keeping fixture manifests shaped like real render() output.
    const list = byTemplate.get(m[1]) ?? [];
    list.push(chunk.replace(/^# Source: .*\n/m, ''));
    byTemplate.set(m[1], list);
  }
  const manifests: Manifest[] = [];
  // mirror src/engine/client.ts:60, which sorts template paths with localeCompare before
  // splitting, so the fixture harness produces manifests in the same order as production.
  for (const templatePath of [...byTemplate.keys()].sort((a, b) => a.localeCompare(b))) {
    manifests.push(...splitManifests(templatePath, byTemplate.get(templatePath)!.join('\n---\n')));
  }
  return { manifests, values };
}
