import react from '@vitejs/plugin-react';
import Sonda from 'sonda/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    Sonda({
      format: 'json',
      open: false,
      gzip: true,
      outputDir: '.sonda/es2015',
    }),
  ],
  base: './',
  build: {
    target: 'es2015',
    outDir: 'dist/es2015',
    sourcemap: true,
  },
});
