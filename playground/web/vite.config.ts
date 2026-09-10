import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base: the SPA is deployed under https://idlefy.github.io/idlefy-universal/playground/
  // (a project Pages site), so a root-absolute '/playground/' would resolve to the wrong origin
  // path and 404 every asset. './' makes the built index.html reference ./assets/... and the
  // engine worker/wasm relative to the document, wherever the bundle is mounted.
  base: './',
  plugins: [react()],
  // ES-module workers are needed by monaco-editor / monaco-yaml.
  // The Helm engine worker is a plain classic script in public/ and is
  // not bundled by Vite, so this setting never applies to it.
  worker: { format: 'es' },
  // monaco-yaml's yaml.worker imports path-browserify, which is CJS-only. It is
  // reachable only from a `?worker` entry, so Vite's dep scanner misses it and dev
  // would serve it raw ("module is not defined" inside the worker). Force-optimize it.
  optimizeDeps: { include: ['path-browserify'] },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 4000 },
});
