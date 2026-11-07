/**
 * vitest.config.ts — Vitest configuration for the Node gateway (backend/node).
 *
 * Two-track test setup（与 scripts/run-script-tests.mjs 同口径）:
 *  - vitest 式用例（`from 'vitest'`）在本 runner 跑；
 *  - 脚本式用例（自制 check() 断言器 + process.exit 收尾）程序化排除，
 *    归 `npm run test:scripts` 以 tsx 子进程跑、退出码判结果。
 *
 * Ad-hoc:   npx vitest run src/routes/__tests__/<file>.test.ts
 * Full:     npm test   (= vitest run over src/**)
 *
 * Repo split 2026-11: replaces the old root vitest.server.config.ts.
 * 两轨合计覆盖 backend/node/src 全部 *.test.ts。
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
 * 2026-11-07（main 线扩容语义，随拆分移植）：从 vitest 收集面**程序化排除**。
 * 此前它们被 include 进来后报 "0 test" 静默判过——async 脚本的 `void main()` 是
 * fire-and-forget，断言可能被 worker 回收截断（跑没跑完、红没红都无保证）。
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

const SCRIPT_STYLE_TESTS = collectScriptStyleTests(path.resolve(__dirname, 'src'));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // 全量收 vitest 式用例（2026-11-07 扩容语义：include 扩到 src/**，此前
    // transport/routes/lib 等目录下的用例从没进过门禁——回归用例写了不被跑
    // 等于没写）。脚本式测试见文件头两轨说明。
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // skill-loader.test.ts 专验 reloadSkills() 里 CommonJS `require(...)` 懒
      // 加载路径，vitest 转 ESM 后必报 Cannot find module——只在本 runner 排除，
      // 归 test:scripts 以 tsx 跑（同 main 线口径）。
      'src/loaders/skill-loader.test.ts',
      ...SCRIPT_STYLE_TESTS.map((p) =>
        path.relative(path.resolve(__dirname), p).replace(/\\/g, '/'),
      ),
    ],
    passWithNoTests: true,
    // 默认 5s/10s 在「全量并行」时不够用：beforeAll 要 chdir + 建临时 sqlite +
    // 起 Express，机器一忙就整条 hook 超时、随机假红。放宽到 30s。
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
