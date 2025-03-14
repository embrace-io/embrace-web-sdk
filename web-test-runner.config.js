import {
  removeViteLogging,
  vitePlugin
} from '@remcovaes/web-test-runner-vite-plugin';

export default {
  nodeResolve: true,
  files: ['src/**/*.test.ts'],
  plugins: [vitePlugin()],
  concurrentBrowsers: 3,
  filterBrowserLogs: removeViteLogging
};
