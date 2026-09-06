import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const root = path.resolve(__dirname, '..', 'src', 'chart-bundle');
const repo = path.resolve(__dirname, '..', '..', '..');

describe('chart bundle', () => {
  it('is generated with all four files', () => {
    for (const f of ['chart.json', 'schema.json', 'examples.json', 'chart-meta.json']) {
      expect(fs.existsSync(path.join(root, f)), f).toBe(true);
    }
  });
  it('excludes tests, ci and the schema from chart.json', () => {
    const chart = JSON.parse(fs.readFileSync(path.join(root, 'chart.json'), 'utf8'));
    const keys = Object.keys(chart);
    expect(keys.some((k) => k.startsWith('tests/'))).toBe(false);
    expect(keys.some((k) => k.startsWith('ci/'))).toBe(false);
    expect(keys).not.toContain('values.schema.json');
    expect(keys).toContain('Chart.yaml');
    expect(keys).toContain('templates/deployment.yaml');
  });
  it('chart-meta version equals Chart.yaml', () => {
    const meta = JSON.parse(fs.readFileSync(path.join(root, 'chart-meta.json'), 'utf8'));
    const chartYaml = parse(fs.readFileSync(path.join(repo, 'charts', 'idlefy-universal', 'Chart.yaml'), 'utf8'));
    expect(meta.version).toBe(chartYaml.version);
    expect(meta.name).toBe('idlefy-universal');
  });
  it('has five examples with labels', () => {
    const ex = JSON.parse(fs.readFileSync(path.join(root, 'examples.json'), 'utf8'));
    expect(ex.length).toBe(5);
    expect(ex[0].id).toBe('01-hello-world');
    expect(ex[0].label.length).toBeGreaterThan(3);
    expect(ex[0].values).toContain('deployments:');
  });
  it('has clean, bounded example labels', () => {
    const ex = JSON.parse(fs.readFileSync(path.join(root, 'examples.json'), 'utf8'));
    for (const e of ex) {
      expect(e.label, e.id).not.toContain('`');
      expect(e.label.endsWith(':'), e.id).toBe(false);
      expect(e.label.length, e.id).toBeLessThanOrEqual(120);
    }
  });
  it('never labels an example with a sentence fragment', () => {
    const ex = JSON.parse(fs.readFileSync(path.join(root, 'examples.json'), 'utf8'));
    for (const e of ex) {
      // "A controller workload that:" — a lead-in to the list below it, not a description.
      const trimmed = e.label.replace(/…$/, '').trim();
      expect(trimmed, e.id).not.toMatch(/\b(that|which|including|such as|like|with|and|or|for|to|of)$/i);
      expect(trimmed, e.id).not.toMatch(/[:,;-]$/);
      expect(trimmed.split(/\s+/).length, e.id).toBeGreaterThanOrEqual(4);
    }
  });
});
