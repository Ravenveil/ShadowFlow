/**
 * vitest.server.config.ts — Vitest configuration for server-side (Node/Express) tests.
 *
 * The root vitest.config.ts targets the React frontend (jsdom environment,
 * include: "src/**"). Server tests live under server/src/** and need a Node
 * environment. Run with:
 *
 *   npx vitest run --config vitest.server.config.ts server/src/routes/__tests__/<file>.test.ts
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
