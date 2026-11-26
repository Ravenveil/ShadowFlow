import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// 只跑纯函数（映射层）；这里没有 DOM 依赖，node 环境就够。
// vitest 是 paper 自己的 devDependency（npm i 后走 node_modules/.bin），
// 不再借用 legacy 的安装目录。
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
