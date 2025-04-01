import {
  removeViteLogging,
  vitePlugin,
} from '@remcovaes/web-test-runner-vite-plugin';
import { playwrightLauncher } from '@web/test-runner-playwright';

// Generated on purpose in src/instrumentations/exceptions/GlobalExceptionInstrumentation/GlobalExceptionInstrumentation.test.ts
const removeGlobalExceptionTestError = ({ args }) =>
  !args.some(arg => arg.includes('GlobalExceptionTestErrorName'));

export default {
  nodeResolve: true,
  files: ['src/**/*.test.ts'],
  plugins: [vitePlugin()],
  browsers: [playwrightLauncher({ product: 'chromium', concurrency: 1 })],
  filterBrowserLogs: log =>
    removeViteLogging(log) && removeGlobalExceptionTestError(log),
};
