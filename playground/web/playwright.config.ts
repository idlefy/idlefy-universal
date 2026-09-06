import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e', timeout: 60_000,
  // clipboard-read/write is needed by e2e/smoke.spec.ts, which replaces editor text via a real
  // clipboard paste (see the comment there on why keyboard.insertText is not used instead).
  use: { baseURL: process.env.PLAYGROUND_URL ?? 'http://127.0.0.1:4173/playground/', headless: true, permissions: ['clipboard-read', 'clipboard-write'] },
  webServer: process.env.PLAYGROUND_URL ? undefined : { command: 'npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1', port: 4173, reuseExistingServer: !process.env.CI, timeout: 180_000 },
});
