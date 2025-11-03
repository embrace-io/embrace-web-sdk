import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 60 * 1000, // 60 seconds
  webServer: [
    {
      name: 'next-latest',
      command:
        'cd platforms/next-latest && npm run build:es2020 && npm run start',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
    },
    {
      name: 'api',
      command: 'npx tsx ../../server/server.ts',
      url: 'http://localhost:3001/health-check',
      reuseExistingServer: false,
    },
  ],
  testMatch: '**/*.spec.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
