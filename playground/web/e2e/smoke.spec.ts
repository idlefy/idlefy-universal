import { test, expect } from '@playwright/test';
import { openYaml, setText } from './helpers';

const BAD = 'deployments:\n  app:\n    replcias: 1\n    containers:\n      main: {image: nginx, imageTag: "1"}\n';
const GOOD = BAD.replace('replcias', 'replicas');
// Unterminated flow sequence: `yaml` cannot parse this at all, unlike BAD above (which parses fine
// and only fails the chart's own schema) — the header's "syntax error" path is a different branch.
const SYNTAX_ERROR = 'deployments: [\n';

test('renders, errors, recovers', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  await openYaml(page);
  await page.getByLabel('examples').selectOption('05-gateway-api');
  // examples/05: Deployment web, Service web, HTTPRoute web + external Gateway eg + release node = 5.
  await expect(page.locator('.rnode')).toHaveCount(5, { timeout: 15_000 });
  await setText(page, BAD);
  await expect(page.locator('.banner.schema')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.banner.schema')).toContainText('replcias');
  await setText(page, GOOD);
  await expect(page.locator('.banner.schema')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.rnode')).toHaveCount(2, { timeout: 15_000 }); // release node + Deployment app
  // Node order follows buildGraph's array: the synthetic Release node is always first, so the
  // real manifest node (the one with a "kind:" line in its detail) is last, not first.
  await page.locator('.rnode').last().click();
  // The detail panel opens on the Fields tab; the rendered manifest lives behind the Manifest tab.
  await page.getByRole('tab', { name: 'Manifest' }).click();
  await expect(page.locator('.detail pre')).toContainText('kind:');
});

test('a YAML syntax error freezes the header with the bad status dot, and recovers once fixed', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  await openYaml(page);
  await setText(page, SYNTAX_ERROR);
  await expect(page.locator('header')).toContainText('YAML has a syntax error', { timeout: 15_000 });
  await expect(page.locator('header .dot')).toHaveClass(/\bbad\b/);
  await setText(page, GOOD);
  await expect(page.locator('header')).toContainText('rendered', { timeout: 15_000 });
});

test('wasm is served with the right content type', async ({ request, baseURL }) => {
  const res = await request.get(new URL('helm.wasm', baseURL).toString());
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['content-type']).toContain('application/wasm');
});
