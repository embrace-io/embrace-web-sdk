import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        host: resolve(import.meta.dirname, 'src/host.ts'),
        app: resolve(import.meta.dirname, 'src/library.ts'),
      },
      output: {
        dir: 'dist',
      },
    },
  },
});
