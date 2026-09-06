import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { toRenderResult } from '../src/engine/client';
import chartFiles from '../src/chart-bundle/chart.json';
import schema from '../src/chart-bundle/schema.json';

const pub = path.resolve(__dirname, '..', 'public');
const wasmPath = path.join(pub, 'helm.wasm');

// Never skipped: scripts/bundle-chart.mjs (npm test's first step) already refuses to run without
// helm.wasm, so a missing engine must fail here too rather than quietly dropping the coverage.
describe('helm.wasm via wasm_exec in node', () => {
  beforeAll(async () => {
    expect(fs.existsSync(wasmPath), `${wasmPath} is missing — run playground/engine/build.sh (make playground-engine)`).toBe(true);
    const g = globalThis as any;
    g.require = createRequire(import.meta.url); g.fs = fs;
    g.crypto ??= (await import('node:crypto')).webcrypto;
    await import(path.join(pub, 'wasm_exec.js'));
    const go = new g.Go();
    const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), go.importObject);
    void go.run(instance);
  });
  const files = JSON.stringify({ ...(chartFiles as Record<string, string>), 'values.schema.json': JSON.stringify(schema) });
  it('renders hello world into Deployment + Service', () => {
    const values = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'examples', '01-hello-world', 'values.yaml'), 'utf8');
    const raw = JSON.parse((globalThis as any).helmRender(files, values, 'demo', 'default'));
    const r = toRenderResult(raw, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifests.map((m) => m.obj.kind).sort()).toEqual(['Deployment', 'Service']);
  });
  it('reports schema errors with a path', () => {
    const raw = JSON.parse((globalThis as any).helmRender(files, 'deployments:\n  app:\n    replcias: 1\n', 'demo', 'default'));
    const r = toRenderResult(raw, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error.kind).toBe('schema'); expect(r.error.path).toBe('/deployments/app'); }
  });
});
