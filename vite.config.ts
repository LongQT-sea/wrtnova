import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// Multi-page build. Each new page joins `input` in the phase that builds it, and
// emits at the same URL the previous site used, so links and bookmarks keep
// working. Until then the superseded page in `public/` is still copied to the same
// path and keeps serving -- rollup's output wins over the public-dir copy for any
// path both produce, so adding an entry here is what retires the old page.
//
//   /builder/   this phase
//   /networks/  Phase 9 (US4)
//   /           Phase 11 (T083)
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@state': resolve(__dirname, 'src/state'),
      '@i18n': resolve(__dirname, 'src/i18n'),
      '@sections': resolve(__dirname, 'src/sections'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        builder: resolve(__dirname, 'builder/index.html'),
      },
    },
  },
  test: {
    include: ['tests/core/**/*.test.ts', 'tests/state/**/*.test.ts'],
    environment: 'node',
  },
});
