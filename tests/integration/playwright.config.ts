import { defineConfig, devices } from '@playwright/test';

const apiServer = {
  name: 'api',
  command: 'npm run server --prefix ../..',
  url: 'http://localhost:3001/health-check',
  reuseExistingServer: true,
};

const platformServers = [
  {
    name: 'next-15-turbopack-app',
    command: 'cd platforms/next-15-turbopack-app && npx next start -p 3010',
    url: 'http://localhost:3010',
    reuseExistingServer: false,
  },
  {
    name: 'next-15-turbopack-pages',
    command: 'cd platforms/next-15-turbopack-pages && npx next start -p 3011',
    url: 'http://localhost:3011',
    reuseExistingServer: false,
  },
  {
    name: 'next-15-webpack-app',
    command: 'cd platforms/next-15-webpack-app && npx next start -p 3012',
    url: 'http://localhost:3012',
    reuseExistingServer: false,
  },
  {
    name: 'next-15-webpack-pages',
    command: 'cd platforms/next-15-webpack-pages && npx next start -p 3013',
    url: 'http://localhost:3013',
    reuseExistingServer: false,
  },
  {
    name: 'next-16-app',
    command: 'cd platforms/next-16-app && npx next start -p 3014',
    url: 'http://localhost:3014',
    reuseExistingServer: false,
  },
  {
    name: 'next-16-pages',
    command: 'cd platforms/next-16-pages && npx next start -p 3015',
    url: 'http://localhost:3015',
    reuseExistingServer: false,
  },
];

// PLATFORM env var controls which platform servers start:
//   undefined  -> all servers (local dev default)
//   'name'     -> only matching servers (CI shards)
//   ''         -> no platform servers, only the API server (CDN tests)
// Vite/webpack platforms are served as static files by the API server, so they
// don't appear in platformServers and need no filtering.
const platformEnv = process.env.PLATFORM;
const filteredPlatforms =
  platformEnv === undefined
    ? platformServers
    : platformServers.filter((s) => platformEnv.split(',').includes(s.name));

const webServer = [apiServer, ...filteredPlatforms];

export default defineConfig({
  timeout: 10 * 1000, // 10 seconds
  webServer,
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
