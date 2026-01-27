import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Sonda from 'sonda/vite';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [Sonda({ enabled: false })],
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        iife: resolve(__dirname, 'iife/index.html'),
        proxy: resolve(__dirname, 'proxy/index.html'),
      },
    },
  },
});
