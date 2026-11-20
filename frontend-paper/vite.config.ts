import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // node_modules 是指向 frontend/node_modules 的 junction，缓存必须落回本目录，
  // 否则 vite 会去清共享的 .vite/deps，既破坏旧前端也撞沙箱的批量删除护栏。
  cacheDir: '.vite-cache',
  server: {
    port: 3008,
    strictPort: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://localhost:8002',
        changeOrigin: true,
        timeout: 0,
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
