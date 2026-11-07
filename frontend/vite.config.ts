import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

export default defineConfig({
  plugins: [react(), nodePolyfills({ include: ['crypto', 'buffer', 'stream'] })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3007,
    // 统一启动器(scripts/dev.mjs)会等后端就绪后再统一开浏览器;
    // 单独跑 vite 时(SF_DEV_OPEN 未设)仍保持自动打开。
    open: process.env.SF_DEV_OPEN !== '0',
    watch: {
      // 忽略 .claude 下的 agent worktree / skill 资源 —— 这些目录文件海量，且个别
      // 路径会让 chokidar 在 Windows 上抛 watch UNKNOWN(-4094) 直接崩溃 dev server。
      // 同理排除 .git / 产物截图 / node_modules，缩小监听面、加速热更。
      ignored: ['**/.claude/**', '**/.git/**', '**/_evidence/**', '**/node_modules/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        timeout: 0,       // No timeout — required for SSE long-lived connections
        // Keep SSE connections alive — don't buffer
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
    },
  },
});
