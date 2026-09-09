import { test, expect } from '@playwright/test';

test('yaml starts collapsed, panes open/close/resize and persist', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  const rail = page.getByRole('button', { name: 'Show values.yaml' });
  await expect(rail).toBeVisible();
  await expect(page.locator('.editor')).toBeHidden();

  await rail.click();
  await expect(page.locator('.editor')).toBeVisible();
  const pane = page.locator('.pane-editor');
  const before = (await pane.boundingBox())!.width;
  const handle = page.getByRole('separator', { name: 'Resize values.yaml' });
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 120, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  const after = (await pane.boundingBox())!.width;
  expect(after).toBeGreaterThan(before + 100);

  await page.reload();
  await expect(page.locator('header')).toContainText('rendered', { timeout: 30_000 });
  await expect(page.locator('.editor')).toBeVisible();
  expect(Math.abs((await pane.boundingBox())!.width - after)).toBeLessThan(2);

  // header button collapses it again; inspector rail appears after selecting and hiding
  await page.getByRole('button', { name: 'YAML', exact: true }).click();
  await expect(page.locator('.editor')).toBeHidden();
  await page.locator('.rnode', { hasText: 'Deployment' }).click();
  await expect(page.locator('.detail')).toBeVisible();
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.locator('.detail')).toBeHidden();
  await page.getByRole('button', { name: 'Show the inspector' }).click();
  await expect(page.locator('.detail')).toBeVisible();

  // re-clicking the selected node reopens a collapsed inspector
  await page.getByRole('button', { name: 'Inspector', exact: true }).click();
  await expect(page.locator('.detail')).toBeHidden();
  await page.locator('.rnode', { hasText: 'Deployment' }).click();
  await expect(page.locator('.detail')).toBeVisible();
});
