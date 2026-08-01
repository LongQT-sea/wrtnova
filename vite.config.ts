import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

/**
 * `npm run build` puts wrtnova.sh in dist/ (scripts/embed-wrtnova.mjs); the dev
 * server has no such step, so it reads the canonical file at the repo root on
 * every request. It is never copied into public/: a stale copy there would be
 * served in preference to the real one, and the script is what the image is
 * made of.
 */
function serveWrtnovaSh(): Plugin {
  return {
    name: 'wrtnova-sh-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/wrtnova.sh', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(readFileSync(resolve(__dirname, 'wrtnova.sh')));
      });
    },
  };
}

// Multi-page build. Every page emits at the URL the previous site used, so links
// and bookmarks keep working:
//
//   /           the landing page
//   /builder/   the single-node builder
//   /networks/  the fleet builder
//
// `public/` is now static assets only -- the superseded pages it used to carry
// were removed in Phase 11, once all three entries below existed.
export default defineConfig({
  plugins: [react(), tailwind(), serveWrtnovaSh()],
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
