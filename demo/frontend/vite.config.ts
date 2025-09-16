import { resolve } from 'node:path';
import Sonda from 'sonda/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [Sonda({ enabled: false })],
  resolve: {
    alias: {
      '@embrace-io/web-sdk/react-instrumentation': resolve(
        __dirname,
        '../../src/react-instrumentation/index.ts'
      ),
      '@embrace-io/web-sdk': resolve(__dirname, '../../src/index.ts'),
    },
  },
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
