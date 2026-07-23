import { defineConfig, devices } from '@playwright/test';
import { GRACEFUL_SHUTDOWN } from './constants/test.ts';

// Headed-only config for manual verification of features that require real
// browser interaction (e.g. the soft navigation polyfill, which depends on
// PerformanceEventTiming entries that headless Chromium does not generate for
// synthetic clicks). Run with:
//   npx playwright test --config playwright.config.headed.ts
export default defineConfig({
  timeout: 6 * 60 * 1000,
  webServer: [
    {
      name: 'vite-react-router',
      command: 'cd platforms/vite-react-router && npx vite preview --port 3016',
      url: 'http://localhost:3016',
      reuseExistingServer: true,
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
  projects: [
    // Standard Chrome: no SoftNavigationHeuristics flag, so the polyfill path
    // is active. Only Chromium generates PerformanceEventTiming for synthetic
    // clicks; Firefox and WebKit do not.
    {
      name: 'chromium',
      testMatch: '**/e2e-headed/soft-navigation-polyfill.spec.ts',
      use: { ...devices['Desktop Chrome'], headless: false },
    },
    // Chrome with SoftNavigationHeuristics enabled: exercises the native
    // soft-navigation PerformanceObserver entry type.
    {
      name: 'chromium-soft-nav-heuristics',
      testMatch: '**/e2e-headed/soft-navigation-native.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        launchOptions: {
          args: ['--enable-features=SoftNavigationHeuristics'],
        },
      },
    },
  ],
});
