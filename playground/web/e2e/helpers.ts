import { expect, type Page } from '@playwright/test';

/**
 * The YAML pane starts collapsed; tests that use the toolbar or type into Monaco open it first.
 * Waits for either the rail or an already-visible editor so it cannot race the first paint.
 */
export async function openYaml(page: Page): Promise<void> {
  const rail = page.getByRole('button', { name: 'Show values.yaml' });
  await rail.or(page.locator('.editor:visible')).first().waitFor();
  if (await rail.isVisible()) await rail.click();
  await expect(page.locator('.editor')).toBeVisible();
}

/**
 * Replace the whole values.yaml. Monaco's textarea is an input proxy, not the document, so `fill()`
 * would insert at the caret; `keyboard.insertText` is processed by Monaco's input controller as if
 * each line were typed with Enter, and `autoIndent: 'keep'` then compounds the indentation. A real
 * clipboard paste goes through Monaco's paste path and inserts the text verbatim.
 */
export async function setText(page: Page, text: string): Promise<void> {
  await page.locator('.editor').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('ControlOrMeta+V');
}
