import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// 只跑纯函数（映射层）；这里没有 DOM 依赖，node 环境就够。
// 注意：跑测试必须走 package.json 里的本地入口
// （node ../legacy/node_modules/vitest/vitest.mjs），不要 npx vitest ——
// npx 会拉 npx 缓存里的另一份 vitest，与测试文件 import 的这份成两个实例，
// describe 注册进错池，报 "No test suite found"。
export default defineConfig({
  // 测试文件也走 @/ 别名，否则分层后每个 import 都要回退成相对路径
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: 'default',
  },
});
