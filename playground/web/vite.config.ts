import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/playground/',
  plugins: [react()],
  // ES-module workers are needed by monaco-editor / monaco-yaml (Task 14).
  // The Helm engine worker is a plain classic script in public/ (Task 7) and is
  // not bundled by Vite, so this setting never applies to it.
  worker: { format: 'es' },
  // monaco-yaml's yaml.worker imports path-browserify, which is CJS-only. It is
  // reachable only from a `?worker` entry, so Vite's dep scanner misses it and dev
  // would serve it raw ("module is not defined" inside the worker). Force-optimize it.
  optimizeDeps: { include: ['path-browserify'] },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 4000 },
});
