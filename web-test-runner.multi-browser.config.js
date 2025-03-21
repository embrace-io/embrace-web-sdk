import { devices, playwrightLauncher } from '@web/test-runner-playwright';
import baseConfig from './web-test-runner.config.js';

export default {
  ...baseConfig,
  browsers: [
    /* Test against desktop browsers */
    playwrightLauncher({
      product: 'chromium',
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Desktop Chrome'] });
      }
    }),
    playwrightLauncher({
      product: 'firefox',
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Desktop Firefox'] });
      }
    }),
    playwrightLauncher({
      product: 'webkit',
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Desktop Safari'] });
      }
    }),
    /* Test against mobile browsers */
    playwrightLauncher({
      product: 'chromium',
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['Pixel 5'] });
      }
    }),
    playwrightLauncher({
      product: 'webkit',
      createBrowserContext({ browser }) {
        return browser.newContext({ ...devices['iPhone 12'] });
      }
    }),
    /* Test against branded browsers. */
    playwrightLauncher({
      product: 'chromium',
      createBrowserContext({ browser }) {
        return browser.newContext({
          ...devices['Desktop Chrome'],
          channel: 'chrome'
        });
      }
    }),
    playwrightLauncher({
      product: 'chromium',
      createBrowserContext({ browser }) {
        return browser.newContext({
          ...devices['Desktop Edge'],
          channel: 'msedge'
        });
      }
    })
  ]
};
