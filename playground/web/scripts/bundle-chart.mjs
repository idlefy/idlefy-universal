// Generates src/chart-bundle/* from the repository. Never committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..');
const chartDir = path.join(repo, 'charts', 'idlefy-universal');
const examplesDir = path.join(repo, 'examples');
const out = path.resolve(here, '..', 'src', 'chart-bundle');
fs.mkdirSync(out, { recursive: true });

const files = {};
const walk = (dir, rel = '') => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (r === 'tests' || r === 'ci') continue;
      walk(abs, r);
    } else if (r !== 'values.schema.json') {
      files[r] = fs.readFileSync(abs, 'utf8');
    }
  }
};
walk(chartDir);
fs.writeFileSync(path.join(out, 'chart.json'), JSON.stringify(files));

fs.copyFileSync(path.join(chartDir, 'values.schema.json'), path.join(out, 'schema.json'));

const chartYaml = parse(files['Chart.yaml']);
fs.writeFileSync(path.join(out, 'chart-meta.json'), JSON.stringify({ name: chartYaml.name, version: chartYaml.version }));

const examples = fs.readdirSync(examplesDir).sort().flatMap((id) => {
  const valuesPath = path.join(examplesDir, id, 'values.yaml');
  if (!fs.existsSync(valuesPath)) return [];
  const readme = fs.existsSync(path.join(examplesDir, id, 'README.md'))
    ? fs.readFileSync(path.join(examplesDir, id, 'README.md'), 'utf8')
    : '';
  const firstPara = readme.split(/\n\s*\n/).map((s) => s.trim()).find((s) => s && !s.startsWith('#')) ?? id;
  return [{ id, label: firstPara.replace(/\s+/g, ' ').slice(0, 120), values: fs.readFileSync(valuesPath, 'utf8') }];
});
fs.writeFileSync(path.join(out, 'examples.json'), JSON.stringify(examples));
console.log(`chart bundle: ${Object.keys(files).length} files, ${examples.length} examples, chart ${chartYaml.version}`);
