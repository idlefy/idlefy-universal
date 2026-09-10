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

/**
 * Clear Monaco's whole model via a real select-all + Delete keystroke, not `fill()` (which would
 * insert at the caret rather than replace the document — same reasoning as `setText` above).
 */
export async function clearEditor(page: Page): Promise<void> {
  await page.locator('.editor').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
}

/**
 * Move focus to `<body>` without depending on header markup or any other specific non-focusable
 * element: blur whatever currently has it. A blur with nothing else to receive it lands focus on
 * `<body>` by default, which is what "focus outside Monaco" tests need — asserted, not assumed.
 */
export async function blurToBody(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page.locator('body')).toBeFocused();
}
