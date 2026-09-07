import { test, expect } from '@playwright/test';

test('inspector edits values, toggles resources, and undo goes through Monaco', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  // example 01 is loaded by default: release + Service hello + Deployment hello
  await expect(page.locator('.rnode')).toHaveCount(3, { timeout: 15_000 });
  await page.locator('.rnode', { hasText: 'Deployment' }).click();
  await expect(page.locator('.detail .tabs [aria-selected="true"]')).toHaveText('Inspector');

  // field edit → YAML
  const replicas = page.getByLabel('deployments.hello.replicas');
  await replicas.fill('3');
  await expect(page.locator('.editor')).toContainText('replicas: 3');

  // toggle off the Service → node disappears, flag written
  // (exact: true — "toggle Service" is otherwise a substring of "toggle ServiceMonitor"/"toggle ServiceAccount")
  await page.getByLabel('toggle Service', { exact: true }).uncheck();
  await expect(page.locator('.rnode')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.locator('.editor')).toContainText('autoCreateService: false');

  // advanced tier reveals a passthrough YAML box
  await page.getByLabel('Advanced').check();
  await expect(page.getByLabel('deployments.hello.tolerations')).toBeVisible();

  // one Ctrl+Z in the editor reverts the last inspector write (the toggle), not the whole session
  await page.locator('.editor').click();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.locator('.rnode')).toHaveCount(3, { timeout: 15_000 });
  await expect(page.locator('.editor')).toContainText('replicas: 3');
});

test('inspector is disabled while the YAML is broken', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.rnode')).toHaveCount(3, { timeout: 30_000 });
  await page.locator('.rnode', { hasText: 'Deployment' }).click();
  await page.locator('.editor').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nbroken: [');
  await expect(page.locator('.inspector')).toContainText('Fix the YAML');
  await expect(page.getByLabel('toggle Service', { exact: true })).toBeDisabled();
});
