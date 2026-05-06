import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

export default defineConfig({
  plugins: [react(), nodePolyfills({ include: ['crypto', 'buffer', 'stream'] })],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Stub out Node.js built-ins pulled in by @0glabs/0g-ts-sdk ZgFile (not needed in browser)
      'node:fs/promises': path.resolve(__dirname, 'src/_stubs/node-fs-promises.ts'),
      'node:fs': path.resolve(__dirname, 'src/_stubs/node-fs.ts'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
