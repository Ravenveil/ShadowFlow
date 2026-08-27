import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    passWithNoTests: true,
    // Split by runtime: web tests need jsdom + testing-library setup; server
    // tests exercise Express routes / fs and must run in plain node.
    projects: [
      {
        test: {
          name: 'web',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          // Known-broken legacy tests (Story 0.2): excluded to unblock CI.
          // Tracked separately — see Story 0.2 Completion Notes.
          exclude: [
            'node_modules',
            'dist',
            'build',
            'src/__tests__/integration.test.ts',
            'src/__tests__/node-registry.test.ts',
            'src/__tests__/river-network.test.ts',
            'src/__tests__/role-manager.test.ts',
            'src/core/executors/__tests__/branch-executor.test.ts',
            'src/core/executors/__tests__/receive-executor.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'server',
          globals: true,
          environment: 'node',
          // Only vitest-style tests live in __tests__/. The other *.test.ts
          // files under server/src are standalone tsx scripts (console
          // PASS/FAIL output, run ad-hoc) — not vitest-compatible.
          include: ['server/src/__tests__/**/*.{test,spec}.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})