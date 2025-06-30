import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 5 * 60 * 1000, // 5 minutes
  webServer: {
    command: 'npx tsx api/server.ts',
    url: 'http://localhost:3000/health-check',
  },
});
