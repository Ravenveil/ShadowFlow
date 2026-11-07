/**
 * vitest.config.ts — Vitest configuration for the Node gateway (backend/node).
 *
 * Runs every vitest-style test under src/** in a plain node environment.
 * Ad-hoc:   npx vitest run src/routes/__tests__/<file>.test.ts
 * Full:     npm test   (= vitest run over src/**)
 *
 * Repo split 2026-11: replaces the old root vitest.server.config.ts.
 * The canonical CI subset (src/__tests__) is also reachable from the
 * frontend workspace via `vitest run --project server`.
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // 只收 vitest 风格用例：src/__tests__（CI 门禁全集）+ src/routes/__tests__
    // （supertest 集成）。lib/**/__tests__ 与 loaders/、prompts/ 下的
    // *.test.ts 是独立 tsx 脚本（console PASS/FAIL、process.exit 收尾），
    // 用 `npx tsx <file>` 直跑——require 风格在 vitest 下解析不了，别误收。
    include: [
      'src/__tests__/**/*.{test,spec}.ts',
      'src/routes/__tests__/**/*.{test,spec}.ts',
    ],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
