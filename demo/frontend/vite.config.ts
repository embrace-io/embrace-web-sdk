import { resolve } from 'node:path';
import Sonda from 'sonda/vite';
import { defineConfig } from 'vite';

const isDevelopment = process.env.NODE_ENV === 'development';

// Debug collector runs at http://localhost:3001 (started by turbo `with` task).
// To send telemetry to it, set VITE_DATA_URL=http://localhost:3001 in .env.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [Sonda({ enabled: false })],
  // In development, alias SDK imports to local source files for live editing.
  // In production, use the installed package from node_modules.
  resolve: isDevelopment
    ? {
        alias: {
          '@embrace-io/web-sdk/react-instrumentation': resolve(
            __dirname,
            '../../packages/web-sdk/src/react-instrumentation/index.ts',
          ),
          '@embrace-io/web-sdk': resolve(
            __dirname,
            '../../packages/web-sdk/src/index.ts',
          ),
        },
      }
    : undefined,
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'react-router-v5': resolve(__dirname, 'react-router-v5/index.html'),
        'react-router-v6-declarative': resolve(
          __dirname,
          'react-router-v6-declarative/index.html',
        ),
        'react-router-v6-data': resolve(
          __dirname,
          'react-router-v6-data/index.html',
        ),
      },
      output: {
        sourcemapDebugIds: true,
      },
    },
  },
});
