import { test, expect } from '@playwright/test';

// The YAML pane starts collapsed; tests that use the toolbar or type into Monaco open it first.
// Waits for either the rail or an already-visible editor so it cannot race the first paint.
const openYaml = async (page: import('@playwright/test').Page) => {
  const rail = page.getByRole('button', { name: 'Show values.yaml' });
  await rail.or(page.locator('.editor:visible')).first().waitFor();
  if (await rail.isVisible()) await rail.click();
  await expect(page.locator('.editor')).toBeVisible();
};

test('add from the empty state with the keyboard, then remove', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  await openYaml(page);
  // Empty document (not `{}`: a flow root would keep every later insert on one line — spec §4).
  // Monaco's textarea is an input proxy: select-all + Delete clears the model without going through fill().
  await page.locator('.editor').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await expect(page.locator('.empty-card')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('header')).toContainText('rendered 0 objects');

  // `A` is ignored while focus is in Monaco; click the card's heading (not a typing target) first.
  await page.locator('.empty-card h3').click();
  await page.keyboard.press('a');
  const dialog = page.getByRole('dialog', { name: 'Add a resource' });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('Search resources')).toBeFocused();
  await page.keyboard.type('dep');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  // exact: true — the toolbar's "namespace" label is a case-insensitive substring of "Name"
  const name = page.getByLabel('Name', { exact: true });
  await expect(name).toHaveValue('backend-api');
  await expect(name).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);

  // The one-shot focusPath selects the new workload once it renders; the inspector opens on Fields.
  await expect(page.locator('.rnode', { hasText: 'Deployment' })).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('.detail .head b')).toHaveText('backend-api');
  await expect(page.locator('.detail [role="tab"][aria-selected="true"]')).toHaveText('Fields');
  await expect(page.locator('.editor')).toContainText('deployments:');
  await expect(page.locator('.editor')).toContainText('backend-api:');
  // the deployment fixup adds a port, so autoCreateService renders a Service too
  await expect(page.locator('.rnode', { hasText: 'Service' })).toHaveCount(1);

  await page.getByLabel('Remove Deployment backend-api').click();
  await expect(page.locator('.rnode', { hasText: 'Deployment' })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.detail')).toHaveCount(0);
  await expect(page.locator('.editor')).not.toContainText('backend-api');
  await expect(page.locator('.empty-card')).toBeVisible();
});

// Optional (beyond spec §11): Monaco + YAML-error integration for the disabled state. Drop it if e2e wall-clock becomes a problem.
test('the Add button is disabled while the YAML is broken', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  await openYaml(page);
  await page.locator('.editor').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.type('deployments: [');
  await expect(page.locator('.add-btn')).toBeDisabled({ timeout: 15_000 });
  await expect(page.locator('.add-btn')).toHaveAttribute('title', 'Fix the YAML syntax error in the editor to edit here.');
});
