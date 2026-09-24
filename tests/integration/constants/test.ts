import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devices } from '@playwright/test';

const EMBRACE_API_REGEX =
  /^https:\/\/[a-z]-[a-z0-9]{5}\.data\.emb-api\.com\/v2\/(spans|logs)$/;
const BASE_URL = 'http://localhost:3000';

// npm-wrapped webServer commands (npm run / npx) place their grandchildren in
// separate process groups, so Playwright's default process-group SIGKILL never
// reaches them. The survivors hold the command's stdio pipes open and teardown
// waits on those pipes forever, hanging the runner after the last test. npm
// relays SIGTERM down the whole chain, so ask Playwright to try that first.
const GRACEFUL_SHUTDOWN = {
  signal: 'SIGTERM',
  timeout: 3000,
} as const;

// macOS 27 TCC-protects ~/Library/Application Support/Firefox, which the bundled
// Firefox reads even with -profile, so point its home elsewhere.
// https://github.com/microsoft/playwright/issues/42768
const FIREFOX_USER_HOME = join(tmpdir(), 'playwright-firefox-home');
mkdirSync(FIREFOX_USER_HOME, { recursive: true });

const FIREFOX_PROJECT = {
  name: 'firefox',
  use: {
    ...devices['Desktop Firefox'],
    launchOptions: {
      env: { ...process.env, CFFIXED_USER_HOME: FIREFOX_USER_HOME },
    },
  },
};

export { BASE_URL, EMBRACE_API_REGEX, FIREFOX_PROJECT, GRACEFUL_SHUTDOWN };
