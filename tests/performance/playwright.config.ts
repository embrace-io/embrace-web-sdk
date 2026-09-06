import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 5 * 60 * 1000, // 5 minutes
  // Run every spec serially in a single worker to avoid competing for CPU resources
  workers: 1,
  fullyParallel: false,
  webServer: {
    command: 'npx tsx api/server.ts',
    url: 'http://localhost:3000/health-check',
  },
});
