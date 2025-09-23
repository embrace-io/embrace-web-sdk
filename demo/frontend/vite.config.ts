import { resolve } from 'node:path';
import Sonda from 'sonda/vite';
import { defineConfig } from 'vite';

const isDevelopment = process.env.NODE_ENV === 'development';

// https://vite.dev/config/
export default defineConfig({
  plugins: [Sonda({ enabled: false })],
  resolve: isDevelopment
    ? {
        alias: {
          '@embrace-io/web-sdk/react-instrumentation': resolve(
            __dirname,
            '../../src/react-instrumentation/index.ts'
          ),
          '@embrace-io/web-sdk': resolve(__dirname, '../../src/index.ts'),
        },
      }
    : undefined,
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
