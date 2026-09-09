import { test, expect } from '@playwright/test';

// The YAML pane starts collapsed; tests that use the toolbar or type into Monaco open it first.
// Waits for either the rail or an already-visible editor so it cannot race the first paint.
const openYaml = async (page: import('@playwright/test').Page) => {
  const rail = page.getByRole('button', { name: 'Show values.yaml' });
  await rail.or(page.locator('.editor:visible')).first().waitFor();
  if (await rail.isVisible()) await rail.click();
  await expect(page.locator('.editor')).toBeVisible();
};

test('inspector edits values, toggles resources, and undo goes through Monaco', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  // example 01 is loaded by default: release + Service hello + Deployment hello
  await expect(page.locator('.rnode')).toHaveCount(3, { timeout: 15_000 });
  await openYaml(page);
  await page.locator('.rnode', { hasText: 'Deployment' }).click();
  await expect(page.locator('.detail [role="tab"][aria-selected="true"]')).toHaveText('Fields');

  // field edit → YAML
  const replicas = page.getByLabel('deployments.hello.replicas');
  await replicas.fill('3');
  await expect(page.locator('.editor')).toContainText('replicas: 3');

  // the switches live on the group panel
  await page.getByLabel('Open group Deployment hello').click();
  await expect(page.locator('.rgroup.selected')).toHaveCount(1);
  await expect(page.locator('.detail [role="tab"][aria-selected="true"]')).toHaveText('Resources');
  // (exact: true — "toggle Service" is otherwise a substring of "toggle ServiceMonitor"/"toggle ServiceAccount")
  await page.getByLabel('toggle Service', { exact: true }).uncheck();
  await expect(page.locator('.rnode')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.locator('.editor')).toContainText('autoCreateService: false');
  // the group survives the rebuild; its workload row opens the Deployment panel
  await page.getByLabel('open Deployment').click();
  await expect(page.locator('.detail .head .kind')).toHaveText('Deployment');

  // advanced tier reveals a passthrough YAML box
  await page.getByLabel('show all fields').check();
  await expect(page.getByLabel('add field deployments.hello.tolerations')).toBeVisible();

  // one Ctrl+Z in the editor reverts the last inspector write (the toggle), not the whole session
  await page.locator('.editor').click();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.locator('.rnode')).toHaveCount(3, { timeout: 15_000 });
  await expect(page.locator('.editor')).toContainText('replicas: 3');
});

test('inspector is disabled while the YAML is broken', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.rnode')).toHaveCount(3, { timeout: 30_000 });
  await openYaml(page);
  await page.locator('.rnode', { hasText: 'Deployment' }).click();
  await page.getByLabel('Open group Deployment hello').click();
  await page.locator('.editor').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nbroken: [');
  await expect(page.locator('.inspector')).toContainText('Fix the YAML');
  await expect(page.getByLabel('toggle Service', { exact: true })).toBeDisabled();
});
