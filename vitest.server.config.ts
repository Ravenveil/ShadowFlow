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
    // server/ is CommonJS: skill-loader.test.ts 专门验 reloadSkills() 里那条
    // `require('./loaders/skill-loader')` 懒加载路径，而 vitest 会把用例转成
    // ESM（没有 require），在 runner 里必报 Cannot find module。
    // 脚本本身用 tsx 跑是 68/0 全绿 —— 所以只在这个 runner 里排除，不删用例。
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'server/src/loaders/skill-loader.test.ts',
    ],
    // 默认 testTimeout 5s / hookTimeout 10s 在「全量 130+ 文件并行」时不够用：
    // beforeAll 里要 chdir + 建临时 sqlite + 起 Express，机器一忙就整条 hook
    // 超时，表现为随机几个文件假红、单跑又全绿（与根配置 web project 的结论
    // 一致）。放宽到 30s；真卡死的用例照样会失败。
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
