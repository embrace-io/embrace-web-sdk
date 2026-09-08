import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 5 * 60 * 1000, // 5 minutes
  // Both specs measure timings against the one webServer below, and the CDP spec
  // drives hundreds of requests at it, so running them at once distorts the results
  workers: 1,
  webServer: {
    command: 'npx tsx api/server.ts',
    url: 'http://localhost:3000/health-check',
  },
});
