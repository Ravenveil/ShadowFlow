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
import { readdirSync, readFileSync } from 'node:fs';

/**
 * 脚本式测试判定（镜像 scripts/run-script-tests.mjs 的 isScriptStyle，保持
 * 同口径）：文件里没有 `from 'vitest'` 且命中任一特征 —— 自制 check() 断言器 /
 * `Run: npx tsx` 头标注 / 末尾 process.exit。这批由 `npm run test:scripts`
 * 以 tsx 子进程跑（退出码判结果）。
 *
 * 2026-11-07：从 vitest 收集面**程序化排除**。此前它们被 include 进来后
 * 报 "0 test" 静默判过——async 脚本的 `void main()` 是 fire-and-forget，
 * 断言可能被 worker 回收截断（跑没跑完、红没红都无保证），等于没人验。
 * 排除后 vitest 只收 vitest 式用例，脚本式归 test:scripts，两轨都确定性。
 */
function collectScriptStyleTests(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) collectScriptStyleTests(p, out);
    else if (entry.name.endsWith('.test.ts')) {
      const text = readFileSync(p, 'utf8');
      const isVitestStyle = /from ['"]vitest['"]/.test(text);
      const isScriptStyle =
        !isVitestStyle &&
        (/function check\s*\(/.test(text) ||
          /Run:\s+(npx\s+)?tsx/.test(text) ||
          /process\.exit/.test(text));
      if (isScriptStyle) out.push(p.replace(/\\/g, '/'));
    }
  }
  return out;
}

const SCRIPT_STYLE_TESTS = collectScriptStyleTests(
  path.resolve(__dirname, 'server/src'),
);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/src/**/*.{test,spec}.{ts,tsx}'],
    // 脚本式测试（自制 check() + process.exit，62 个）被 collectScriptStyleTests
    // 程序化排除，归 `npm run test:scripts`（tsx 子进程、退出码判结果）管；
    // vitest 这边只收 vitest 式用例。两轨合计覆盖 server/src 全部 *.test.ts，
    // 判定口径镜像 scripts/run-script-tests.mjs 的 isScriptStyle。
    // 2026-11-07：此前脚本式被 include 进来后报 "0 test" 静默判过——async 脚本的
    // `void main()` 是 fire-and-forget，断言可能被 worker 回收截断（跑没跑完、
    // 红没红都无保证），等于没人验。现在两轨都确定性。
    //
    // server/ is CommonJS: skill-loader.test.ts 专门验 reloadSkills() 里那条
    // `require('./loaders/skill-loader')` 懒加载路径，而 vitest 会把用例转成
    // ESM（没有 require），在 runner 里必报 Cannot find module。
    // 脚本本身用 tsx 跑是 68/0 全绿 —— 所以只在这个 runner 里排除，不删用例。
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'server/src/loaders/skill-loader.test.ts',
      ...SCRIPT_STYLE_TESTS.map((p) =>
        path.relative(path.resolve(__dirname), p).replace(/\\/g, '/'),
      ),
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
