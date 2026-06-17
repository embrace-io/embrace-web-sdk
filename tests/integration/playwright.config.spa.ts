import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  timeout: 10 * 1000, // 10 seconds
  webServer: [
    {
      name: 'vite-react-router',
      command:
        'cd platforms/vite-react-router && npm run build && npx vite preview --port 3016',
      url: 'http://localhost:3016',
      reuseExistingServer: false,
    },
    {
      name: 'api',
      command: 'npm run server --prefix ../..',
      url: 'http://localhost:3001/health-check',
      reuseExistingServer: true,
    },
  ],
  testMatch: '**/vite-react-router-tests.spec.ts',
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
