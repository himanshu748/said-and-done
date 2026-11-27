import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// The local demo and browser tests run the UI with a sample Forge bridge.
export default defineConfig({
  root,
  plugins: [
    react(),
    {
      name: 'sample-data-notice',
      transformIndexHtml: () => [{
        tag: 'p',
        attrs: { style: 'margin: 0; padding: 8px 16px; text-align: center; background: var(--amber-bg);' },
        children: 'Local demo with sample data. Reload to reset your changes.',
        injectTo: 'body-prepend',
      }],
    },
  ],
  resolve: {
    alias: {
      '@forge/bridge': fileURLToPath(new URL('./e2e/bridge-mock.ts', import.meta.url)),
      '@core': fileURLToPath(new URL('../../src/core', import.meta.url)),
    },
  },
  server: { port: 4173, strictPort: true },
});
