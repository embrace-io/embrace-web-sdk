import { devices, playwrightLauncher } from '@web/test-runner-playwright';
import baseConfig from './web-test-runner.config.js';

const TEN_MINUTES = 600000;
const SHARED_LAUNCH_OPTIONS = {
  concurrency: 1,
  launchOptions: {
    timeout: TEN_MINUTES
  }
};
export default {
  ...baseConfig,
  concurrentBrowsers: 1,
  browserStartTimeout: TEN_MINUTES, // 10 minutes. Required as we do not parallelize tests enough to start all browsers at once.
  browsers: [
    /* Test against desktop browsers */
    playwrightLauncher({
      product: 'chromium',
      ...SHARED_LAUNCH_OPTIONS,
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Desktop Chrome'] });
      }
    }),
    playwrightLauncher({
      product: 'firefox',
      ...SHARED_LAUNCH_OPTIONS,
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Desktop Firefox'] });
      }
    }),
    playwrightLauncher({
      product: 'webkit',
      ...SHARED_LAUNCH_OPTIONS,
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Desktop Safari'] });
      }
    }),
    /* Test against mobile browsers */
    playwrightLauncher({
      product: 'chromium',
      ...SHARED_LAUNCH_OPTIONS,
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Pixel 5'] });
      }
    }),
    playwrightLauncher({
      product: 'webkit',
      ...SHARED_LAUNCH_OPTIONS,
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['iPhone 12'] });
      }
    }),
    /* Test against branded browsers. */
    playwrightLauncher({
      product: 'chromium',
      ...SHARED_LAUNCH_OPTIONS,
      createBrowserContext({ browser }) {
        return browser.newContext({
          ...devices['Desktop Chrome'],
          channel: 'chrome'
        });
      }
    }),
    playwrightLauncher({
      product: 'chromium',
      ...SHARED_LAUNCH_OPTIONS,
      createBrowserContext({ browser }) {
        return browser.newContext({
          ...devices['Desktop Edge'],
          channel: 'msedge'
        });
      }
    })
  ]
};
