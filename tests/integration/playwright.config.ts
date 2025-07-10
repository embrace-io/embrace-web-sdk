import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 5 * 60 * 1000, // 5 minutes
  webServer: [
    {
      name: 'next-latest',
      command:
        'cd platforms/next-latest && npm run build:es2020 && npm run start',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
    },
    {
      name: 'api',
      command: 'npx tsx server/server.ts',
      url: 'http://localhost:3001/health-check',
      reuseExistingServer: true,
    },
  ],
  testMatch: '**/*.spec.ts',
});
