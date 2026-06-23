import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2015',
    outDir: 'dist/es2015',
    sourcemap: true,
  },
});
