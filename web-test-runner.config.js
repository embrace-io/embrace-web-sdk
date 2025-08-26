import {
  removeViteLogging,
  vitePlugin,
} from '@remcovaes/web-test-runner-vite-plugin';
import { playwrightLauncher } from '@web/test-runner-playwright';

// These errors are generated on purpose in
// src/instrumentations/exceptions/GlobalExceptionInstrumentation/GlobalExceptionInstrumentation.test.ts
const removeGlobalExceptionTestError = ({ args, type }) => {
  if (
    args.some(
      arg =>
        typeof arg == 'string' && arg.includes('GlobalExceptionTestErrorName')
    )
  ) {
    return false;
  }

  // Logged when we trigger an ErrorEvent with only `message` and no `error`
  if (type === 'error' && args.length === 1 && args[0] === undefined) {
    return false;
  }
};

export default {
  nodeResolve: true,
  files: ['src/**/*.test.ts'],
  plugins: [
    vitePlugin({
      optimizeDeps: {
        // Will cause errors when it crawls the demo/ and tests/ directories for html files from other app builds
        entries: [],
      },
      server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: false,
        hmr: false,
        watch: null,
      },
    }),
  ],
  browsers: [
    playwrightLauncher({
      product: 'chromium',
      concurrency: 1,
      // needed for the docker container in CI
      launchOptions: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
        ],
      },
    }),
  ],
  browserLogs: true,
  filterBrowserLogs: removeGlobalExceptionTestError,
};
