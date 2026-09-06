import { defineConfig } from '@playwright/test';
// Relative navigations (`page.goto('./')`, `new URL('helm.wasm', baseURL)`) resolve against the
// last path segment, so a base without the trailing slash would drop the /playground/ prefix.
const baseURL = (process.env.PLAYGROUND_URL ?? 'http://127.0.0.1:4173/playground/').replace(/\/?$/, '/');
export default defineConfig({
  testDir: 'e2e', timeout: 60_000,
  // A stray .only must fail CI rather than silently shrink the suite.
  forbidOnly: !!process.env.CI,
  // clipboard-read/write is needed by e2e/smoke.spec.ts, which replaces editor text via a real
  // clipboard paste (see the comment there on why keyboard.insertText is not used instead).
  use: { baseURL, headless: true, permissions: ['clipboard-read', 'clipboard-write'], trace: 'retain-on-failure' },
  webServer: process.env.PLAYGROUND_URL ? undefined : { command: 'npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1', port: 4173, reuseExistingServer: !process.env.CI, timeout: 180_000 },
});
