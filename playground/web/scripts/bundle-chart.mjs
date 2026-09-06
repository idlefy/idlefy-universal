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

// The SPA is useless without the wasm engine and its loader, and vite happily builds without
// them (the failure only shows up in the browser), so gate every bundle here instead.
const pub = path.resolve(here, '..', 'public');
const missing = ['helm.wasm', 'wasm_exec.js'].filter((f) => !fs.existsSync(path.join(pub, f)));
if (missing.length) {
  console.error(`bundle-chart: playground/web/public/${missing.join(' and ')} missing — build the engine first (bash playground/engine/build.sh, or make playground-engine)`);
  process.exit(1);
}

const files = {};
const walk = (dir, rel = '') => {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
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
if (!chartYaml?.name || !chartYaml?.version) {
  console.error(`bundle-chart: Chart.yaml is missing "name" or "version" (got name=${chartYaml?.name}, version=${chartYaml?.version})`);
  process.exit(1);
}
fs.writeFileSync(path.join(out, 'chart-meta.json'), JSON.stringify({ name: chartYaml.name, version: chartYaml.version }));

const MAX_LABEL_LEN = 120;
const toLabel = (text) => {
  let label = text.replace(/\s+/g, ' ').trim().replace(/`/g, '');
  label = label.replace(/:\s*$/, '');
  if (label.length > MAX_LABEL_LEN) {
    const truncated = label.slice(0, MAX_LABEL_LEN);
    const lastSpace = truncated.lastIndexOf(' ');
    label = (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '…';
  }
  return label;
};

const examples = fs.readdirSync(examplesDir).sort().flatMap((id) => {
  const valuesPath = path.join(examplesDir, id, 'values.yaml');
  if (!fs.existsSync(valuesPath)) return [];
  const readme = fs.existsSync(path.join(examplesDir, id, 'README.md'))
    ? fs.readFileSync(path.join(examplesDir, id, 'README.md'), 'utf8')
    : '';
  // A paragraph ending in ":" only introduces the block below it ("A workload that:"), and a
  // bullet block is not a sentence — skip both and take the first paragraph that stands alone.
  const paras = readme.split(/\n\s*\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  const firstPara = paras.find((s) => !s.endsWith(':') && !/^[-*]\s/.test(s)) ?? paras[0] ?? id;
  return [{ id, label: toLabel(firstPara), values: fs.readFileSync(valuesPath, 'utf8') }];
});
fs.writeFileSync(path.join(out, 'examples.json'), JSON.stringify(examples));
console.log(`chart bundle: ${Object.keys(files).length} files, ${examples.length} examples, chart ${chartYaml.version}`);
