import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        host: resolve(__dirname, 'src/host.ts'),
        app: resolve(__dirname, 'src/library.ts'),
      },
      output: {
        dir: 'dist',
      },
    },
  },
});
