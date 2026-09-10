import { test, expect } from '@playwright/test';
import { openYaml, setText, clearEditor, blurToBody } from './helpers';

test('add from the empty state with the keyboard, then remove', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  await openYaml(page);
  // Empty document. (A flow `{}` root is covered by its own test below — inserts are block either way.)
  await clearEditor(page);
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
  // Block style, not flow.
  await expect
    .poll(async () => (await page.locator('.view-lines').innerText()), { timeout: 15_000 })
    .toMatch(/deployments:\n\s+backend-api:/);
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
  await clearEditor(page);
  await page.keyboard.type('deployments: [');
  await expect(page.locator('.add-btn')).toBeDisabled({ timeout: 15_000 });
  await expect(page.locator('.add-btn')).toHaveAttribute('title', 'Fix the YAML syntax error in the editor to edit here.');
});

test('the launcher scrolls the active row into view', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  await page.locator('.add-btn').click();
  const list = page.locator('.launcher .list');
  await expect(list).toBeVisible();
  expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
  // ↑ from the first row wraps to the last (PVC), which is below the fold of the 440px container.
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.launcher .row.active code')).toHaveText('persistentVolumeClaims');
  await expect.poll(async () => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect.poll(async () => list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test('adding into an existing `deployments: {}` stays block style', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  await openYaml(page);
  await setText(page, 'deployments: {}\n');
  await expect(page.locator('.empty-card')).toBeVisible({ timeout: 15_000 });
  await page.locator('.add-btn').click();
  await page.keyboard.type('dep');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('.rnode', { hasText: 'Deployment' })).toHaveCount(1, { timeout: 15_000 });
  await expect
    .poll(async () => (await page.locator('.view-lines').innerText()), { timeout: 15_000 })
    .toMatch(/deployments:\n\s+backend-api:/);
});

test('Ctrl+Z outside the editor undoes an add, and Ctrl+Shift+Z redoes with the pane collapsed', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  await openYaml(page);
  await clearEditor(page);
  await expect(page.locator('.empty-card')).toBeVisible({ timeout: 15_000 });
  await page.locator('.empty-card h3').click();
  await page.keyboard.press('a');
  await page.keyboard.type('dep');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('.rnode', { hasText: 'Deployment' })).toHaveCount(1, { timeout: 15_000 });
  // Focus is on the canvas/inspector, not Monaco: this is the global path.
  await blurToBody(page);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.locator('.empty-card')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.editor')).not.toContainText('backend-api');
  // and again with the pane collapsed — the case the finding is actually about
  await page.getByRole('button', { name: 'YAML', exact: true }).click();
  await expect(page.locator('.editor')).toBeHidden();
  await blurToBody(page);
  await page.keyboard.press('ControlOrMeta+Shift+Z');   // redo brings the Deployment back
  await expect(page.locator('.rnode', { hasText: 'Deployment' })).toHaveCount(1, { timeout: 15_000 });
});

test('the launcher does not re-appear by itself after a YAML error, nor survive an example load', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Add a resource' });
  // Open the pane before the launcher, then focus Monaco programmatically (no pointer event): a
  // click on `.editor` while the launcher is open is itself a pointerdown outside `.add-wrap`, which
  // closes the launcher via AddButton's own outside-click handling before the YAML ever breaks —
  // that would leave this green even without the App-level `yamlBroken` guard under test.
  await openYaml(page);
  await page.locator('.add-btn').click();
  await expect(dialog).toBeVisible();
  await page.locator('.editor textarea').first().focus();
  await page.keyboard.press('ControlOrMeta+End');
  await expect(dialog).toBeVisible();
  await page.keyboard.type('\nbroken: [');
  await expect(page.locator('.add-btn')).toBeDisabled({ timeout: 15_000 });
  await expect(dialog).toHaveCount(0);
  // fixing the typo must not bring the stale popover back
  await page.keyboard.press('Backspace');
  await expect(page.locator('.add-btn')).toBeEnabled({ timeout: 15_000 });
  await expect(dialog).toHaveCount(0);

  await page.locator('.add-btn').click();
  await expect(dialog).toBeVisible();
  await page.getByLabel('examples').selectOption('05-gateway-api');
  await expect(dialog).toHaveCount(0);
});

// Task 9 review (controller ruling): the undo bridge must reach Monaco's stack even when the
// pane is collapsed and no Monaco instance is mounted-visible to receive the keystroke.
test('undo restores a node removed via the detail panel while the YAML pane is collapsed', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  // exercise the same pane toggle panes.spec.ts uses, landing on collapsed rather than assuming it.
  await openYaml(page);
  await page.getByRole('button', { name: 'YAML', exact: true }).click();
  await expect(page.locator('.editor')).toBeHidden();

  const nodes = page.locator('.rnode');
  const before = await nodes.count();   // example 01: release + Service hello + Deployment hello
  await page.locator('.rnode', { hasText: 'Deployment' }).click();
  await expect(page.locator('.detail')).toBeVisible();
  await page.getByLabel('Remove Deployment hello').click();
  // removing the Deployment also removes its auto-created Service, leaving only the release node.
  await expect(nodes).toHaveCount(1, { timeout: 15_000 });

  // Focus is on the page chrome, not Monaco (which isn't even visible): the global undo path.
  await blurToBody(page);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(nodes).toHaveCount(before, { timeout: 15_000 });
});
