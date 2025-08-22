import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'sdk.js',
        chunkFileNames: 'sdk.js', // or different name if you split code
        assetFileNames: 'sdk.[ext]', // for CSS, images, etc.
      },
    },
  },
});
