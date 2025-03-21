import {
  removeViteLogging,
  vitePlugin
} from '@remcovaes/web-test-runner-vite-plugin';
import { playwrightLauncher } from '@web/test-runner-playwright';

export default {
  nodeResolve: true,
  files: ['src/**/*.test.ts'],
  plugins: [vitePlugin()],
  browsers: [playwrightLauncher({ product: 'chromium', concurrency: 5 })],
  concurrentBrowsers: 3,
  filterBrowserLogs: removeViteLogging
};
