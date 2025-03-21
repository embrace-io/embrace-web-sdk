import { devices, playwrightLauncher } from '@web/test-runner-playwright';
import baseConfig from './web-test-runner.config.js';

const TEN_MINUTES = 600000;

export default {
  ...baseConfig,
  browserStartTimeout: TEN_MINUTES, // 10 minutes. Required as we do not parallelize tests enough to start all browsers at once.
  browsers: [
    /* Test against desktop browsers */
    playwrightLauncher({
      product: 'chromium',
      launchOptions: {
        timeout: TEN_MINUTES
      },
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Desktop Chrome'] });
      }
    }),
    playwrightLauncher({
      product: 'firefox',
      launchOptions: {
        timeout: TEN_MINUTES
      },
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Desktop Firefox'] });
      }
    }),
    playwrightLauncher({
      product: 'webkit',
      launchOptions: {
        timeout: TEN_MINUTES
      },
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Desktop Safari'] });
      }
    }),
    /* Test against mobile browsers */
    playwrightLauncher({
      product: 'chromium',
      launchOptions: {
        timeout: TEN_MINUTES
      },
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Pixel 5'] });
      }
    }),
    playwrightLauncher({
      product: 'webkit',
      launchOptions: {
        timeout: TEN_MINUTES
      },
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['iPhone 12'] });
      }
    }),
    /* Test against branded browsers. */
    playwrightLauncher({
      product: 'chromium',
      launchOptions: {
        timeout: TEN_MINUTES
      },
      createBrowserContext({ browser }) {
        return browser.newContext({
          ...devices['Desktop Chrome'],
          channel: 'chrome'
        });
      }
    }),
    playwrightLauncher({
      product: 'chromium',
      launchOptions: {
        timeout: TEN_MINUTES
      },
      createBrowserContext({ browser }) {
        return browser.newContext({
          ...devices['Desktop Edge'],
          channel: 'msedge'
        });
      }
    })
  ]
};
