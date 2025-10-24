import { vitePlugin } from '@remcovaes/web-test-runner-vite-plugin';
import { playwrightLauncher } from '@web/test-runner-playwright';

const filterBrowserLogs = ({ args, type }) => {
  // These errors are generated on purpose in
  // src/instrumentations/exceptions/GlobalExceptionInstrumentation/GlobalExceptionInstrumentation.test.ts
  if (
    args.some(
      (arg) =>
        typeof arg == 'string' && arg.includes('GlobalExceptionTestErrorName'),
    )
  ) {
    return false;
  }

  // Logged when we trigger an ErrorEvent with only `message` and no `error`
  if (type === 'error' && args.length === 1 && args[0] === undefined) {
    return false;
  }

  return true;
};

/**
 * Web Test Runner configuration
 * @type {import('@web/test-runner').TestRunnerConfig}
 */
export default {
  nodeResolve: true,
  files: ['src/**/*.test.ts'],
  plugins: [
    vitePlugin({
      optimizeDeps: {
        // Vite dependency optimization can cause flakiness in CI test runs, turn it off except for the specific modules
        // where we need to convert from cjs to esm
        noDiscovery: true,
        include: [
          'hoist-non-react-statics',
          'react',
          '@opentelemetry/otlp-transformer',
          '@opentelemetry/instrumentation-fetch',
        ],
      },
      server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: false,
        hmr: false,
      },
    }),
  ],
  browsers: [
    playwrightLauncher({
      product: 'chromium',
      concurrency: 3,
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
  filterBrowserLogs,
};
