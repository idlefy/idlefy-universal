// Renders each ci values file with the real helm binary into graph test fixtures.
// Re-run after chart template changes: node scripts/gen-graph-fixtures.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const chart = path.join(repo, 'charts', 'idlefy-universal');
const out = path.resolve(here, '..', 'src', 'graph', '__fixtures__');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(path.join(chart, 'ci')).filter((f) => f.endsWith('.yaml'))) {
  const name = f.replace(/-values\.yaml$/, '');
  const rendered = execFileSync(
    'helm',
    ['template', 'demo', chart, '-f', path.join(chart, 'ci', f), '--namespace', 'default', '--kube-version', 'v1.35.0'],
    { encoding: 'utf8' },
  );
  fs.writeFileSync(path.join(out, `${name}.yaml`), rendered);
  fs.copyFileSync(path.join(chart, 'ci', f), path.join(out, `${name}.values.yaml`));
  console.log('fixture', name);
}
