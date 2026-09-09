// helm splits rendered text on /^---/m, so a `---` glued to the next document's first line renders
// fine under `helm template` and blanks the playground canvas (src/engine/split.ts parses with
// yaml.parseAllDocuments). Finding 1 / report-edit-integrity B3, QA H-1/H-2.
import { describe, it, expect, beforeAll } from 'vitest';
import { bootEngine, renderRaw, KITCHEN_SINK, SKIP, TIMEOUT } from './integrity';

describe('rendered manifests keep their document separators', () => {
  beforeAll(bootEngine);
  it.skipIf(SKIP)('no template glues `---` to the next document', () => {
    const raw = renderRaw(KITCHEN_SINK);
    expect(raw.ok, raw.ok ? '' : raw.error.message).toBe(true);
    if (!raw.ok) return;
    const glued: string[] = [];
    for (const [file, text] of Object.entries(raw.manifests)) {
      text.split('\n').forEach((line, i) => {
        if (/^---\S/.test(line)) glued.push(`${file}:${i + 1}: ${line.slice(0, 60)}`);
      });
    }
    expect(glued).toEqual([]);
  }, TIMEOUT);
});
