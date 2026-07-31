import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// Multi-page build: the landing page plus the two product pages. Vite emits
// them at the same URLs the previous site used (/, /builder/, /networks/), so
// existing links and bookmarks keep working.
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
        landing: resolve(__dirname, 'index.html'),
        builder: resolve(__dirname, 'builder/index.html'),
        networks: resolve(__dirname, 'networks/index.html'),
      },
    },
  },
  test: {
    include: ['tests/core/**/*.test.ts', 'tests/state/**/*.test.ts'],
    environment: 'node',
  },
});
