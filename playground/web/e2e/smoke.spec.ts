import { test, expect } from '@playwright/test';

const BAD = 'deployments:\n  app:\n    replcias: 1\n    containers:\n      main: {image: nginx, imageTag: "1"}\n';
const GOOD = BAD.replace('replcias', 'replicas');

// The YAML pane starts collapsed; tests that use the toolbar or type into Monaco open it first.
// Waits for either the rail or an already-visible editor so it cannot race the first paint.
const openYaml = async (page: import('@playwright/test').Page) => {
  const rail = page.getByRole('button', { name: 'Show values.yaml' });
  await rail.or(page.locator('.editor:visible')).first().waitFor();
  if (await rail.isVisible()) await rail.click();
  await expect(page.locator('.editor')).toBeVisible();
};

test('renders, errors, recovers', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  await openYaml(page);
  await page.getByLabel('examples').selectOption('05-gateway-api');
  // examples/05: Deployment web, Service web, HTTPRoute web + external Gateway eg + release node = 5.
  await expect(page.locator('.rnode')).toHaveCount(5, { timeout: 15_000 });
  // Monaco's textarea is an input proxy, not the document: fill() would insert at the caret.
  // keyboard.insertText does replace the selection, but Chromium's CDP-level insertText is
  // processed by Monaco's textarea input controller as if each line were typed with Enter:
  // autoIndent: 'keep' (Editor.tsx) then copies the previous line's indentation onto every
  // subsequent line's own leading spaces, compounding indentation and corrupting the YAML
  // (verified: the model ends up with growing indents and never becomes the intended text).
  // A real clipboard paste goes through Monaco's paste path instead, which inserts the
  // clipboard text verbatim with no indent adjustment, so select-all + paste is used here.
  const setText = async (text: string) => {
    await page.locator('.editor').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.evaluate((t) => navigator.clipboard.writeText(t), text);
    await page.keyboard.press('ControlOrMeta+V');
  };
  await setText(BAD);
  await expect(page.locator('.banner.schema')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.banner.schema')).toContainText('replcias');
  await setText(GOOD);
  await expect(page.locator('.banner.schema')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.rnode')).toHaveCount(2, { timeout: 15_000 }); // release node + Deployment app
  // Node order follows buildGraph's array: the synthetic Release node is always first, so the
  // real manifest node (the one with a "kind:" line in its detail) is last, not first.
  await page.locator('.rnode').last().click();
  // The detail panel opens on the Fields tab; the rendered manifest lives behind the Manifest tab.
  await page.getByRole('tab', { name: 'Manifest' }).click();
  await expect(page.locator('.detail pre')).toContainText('kind:');
});

test('wasm is served with the right content type', async ({ request, baseURL }) => {
  const res = await request.get(new URL('helm.wasm', baseURL).toString());
  expect(res.ok()).toBeTruthy();
  expect(res.headers()['content-type']).toContain('application/wasm');
});
