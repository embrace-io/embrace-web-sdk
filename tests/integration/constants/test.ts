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

export { BASE_URL, EMBRACE_API_REGEX, GRACEFUL_SHUTDOWN };
