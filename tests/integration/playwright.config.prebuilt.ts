import { defineConfig, devices } from '@playwright/test';

// Config for fast iteration: assumes all platforms are already built and servers are already running.
// Use with the --serve / --test modes of scripts/test-integration-podman.sh.
export default defineConfig({
  globalSetup: './global-setup.ts',
  timeout: 10 * 1000, // 10 seconds
  webServer: [
    {
      name: 'next-15-turbopack-app',
      command: 'cd platforms/next-15-turbopack-app && npx next start -p 3010',
      url: 'http://localhost:3010',
      reuseExistingServer: true,
      timeout: 30 * 1000,
    },
    {
      name: 'next-15-turbopack-pages',
      command: 'cd platforms/next-15-turbopack-pages && npx next start -p 3011',
      url: 'http://localhost:3011',
      reuseExistingServer: true,
      timeout: 30 * 1000,
    },
    {
      name: 'next-15-webpack-app',
      command: 'cd platforms/next-15-webpack-app && npx next start -p 3012',
      url: 'http://localhost:3012',
      reuseExistingServer: true,
      timeout: 30 * 1000,
    },
    {
      name: 'next-15-webpack-pages',
      command: 'cd platforms/next-15-webpack-pages && npx next start -p 3013',
      url: 'http://localhost:3013',
      reuseExistingServer: true,
      timeout: 30 * 1000,
    },
    {
      name: 'next-16-app',
      command: 'cd platforms/next-16-app && npx next start -p 3014',
      url: 'http://localhost:3014',
      reuseExistingServer: true,
      timeout: 30 * 1000,
    },
    {
      name: 'next-16-pages',
      command: 'cd platforms/next-16-pages && npx next start -p 3015',
      url: 'http://localhost:3015',
      reuseExistingServer: true,
      timeout: 30 * 1000,
    },
    {
      name: 'vite-react-router',
      command: 'cd platforms/vite-react-router && npx vite preview --port 3016',
      url: 'http://localhost:3016',
      reuseExistingServer: true,
      timeout: 30 * 1000,
    },
    {
      name: 'api',
      command: 'npm run server --prefix ../..',
      url: 'http://localhost:3001/health-check',
      reuseExistingServer: true,
      timeout: 30 * 1000,
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
