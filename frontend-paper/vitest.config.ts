import { defineConfig } from 'vitest/config';

// 只跑纯函数（映射层）；这里没有 DOM 依赖，node 环境就够。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: 'default',
  },
});
