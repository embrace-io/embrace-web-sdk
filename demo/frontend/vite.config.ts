import { defineConfig } from 'vite';
import Sonda from 'sonda/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [Sonda({ enabled: false })],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        sourcemapDebugIds: true,
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@opentelemetry')) {
              return 'opentelemetry';
            }
            if (id.includes('react')) {
              return 'react';
            }

            // All other node_modules go into 'vendor'
            return 'vendor';
          }
          return null;
        },
      },
    },
  },
});
