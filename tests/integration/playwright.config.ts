import { defineConfig, devices } from '@playwright/test';
import { GRACEFUL_SHUTDOWN } from './constants/test.ts';

export default defineConfig({
  timeout: 10 * 1000, // 10 seconds
  webServer: [
    {
      name: 'next-15-turbopack-app',
      command:
        'cd platforms/next-15-turbopack-app && npm run build && npx next start -p 3010',
      url: 'http://localhost:3010',
      reuseExistingServer: false,
      gracefulShutdown: GRACEFUL_SHUTDOWN,
    },
    {
      name: 'next-15-turbopack-pages',
      command:
        'cd platforms/next-15-turbopack-pages && npm run build && npx next start -p 3011',
      url: 'http://localhost:3011',
      reuseExistingServer: false,
      gracefulShutdown: GRACEFUL_SHUTDOWN,
    },
    {
      name: 'next-15-webpack-app',
      command:
        'cd platforms/next-15-webpack-app && npm run build && npx next start -p 3012',
      url: 'http://localhost:3012',
      reuseExistingServer: false,
      gracefulShutdown: GRACEFUL_SHUTDOWN,
    },
    {
      name: 'next-15-webpack-pages',
      command:
        'cd platforms/next-15-webpack-pages && npm run build && npx next start -p 3013',
      url: 'http://localhost:3013',
      reuseExistingServer: false,
      gracefulShutdown: GRACEFUL_SHUTDOWN,
    },
    {
      name: 'next-16-app',
      command:
        'cd platforms/next-16-app && npm run build && npx next start -p 3014',
      url: 'http://localhost:3014',
      reuseExistingServer: false,
      gracefulShutdown: GRACEFUL_SHUTDOWN,
    },
    {
      name: 'next-16-pages',
      command:
        'cd platforms/next-16-pages && npm run build && npx next start -p 3015',
      url: 'http://localhost:3015',
      reuseExistingServer: false,
      gracefulShutdown: GRACEFUL_SHUTDOWN,
    },
    {
      name: 'vite-react-router',
      command:
        'cd platforms/vite-react-router && npm run build && npx vite preview --port 3016',
      url: 'http://localhost:3016',
      reuseExistingServer: false,
      gracefulShutdown: GRACEFUL_SHUTDOWN,
    },
    {
      name: 'api',
      command: 'npm run server --prefix ../..',
      url: 'http://localhost:3001/health-check',
      reuseExistingServer: true,
      gracefulShutdown: GRACEFUL_SHUTDOWN,
    },
  ],
  testMatch: '**/*.spec.ts',
  testIgnore: '**/e2e-headed/**',
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
