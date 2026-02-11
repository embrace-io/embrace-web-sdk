# Embrace Web SDK Integration Tests

Integration tests verify that the SDK builds correctly across multiple bundlers and functions correctly in real-world scenarios.

## Running Integration Tests

To run the full test suite (build tests + end-to-end tests):

```bash
npm run test:integration
```

To update golden files after intentional SDK changes:

```bash
npm run test:integration:update-golden
```

## Test Structure

The integration tests consist of two phases:

### 1. Build Tests

Build tests verify the SDK can be built correctly for each platform and checks bundle sizes.

**Platforms tested:**
- Webpack 4 (es2015)
- Webpack 5 (es2015)
- Vite 6 (es2015)
- Vite 7 (es2015)
- Next.js 15 (Webpack, Turbopack) with Pages Router and App Router
- Next.js 16 (Webpack, Turbopack) with Pages Router and App Router

**Run only build tests:**
```bash
npm run build-platforms
```

**What they verify:**
- SDK builds without errors
- Bundle sizes are within expected ranges (via Sonda)
- Generated output is placed in the correct location for e2e tests

Build test results are stored in `tests/integration/build-test-results/`.

### 2. End-to-End Tests

End-to-end tests verify the built SDK works in real applications and communicates with the Embrace backend correctly.

**Platforms tested:**
- Next.js 15 (Webpack, Turbopack) with Pages Router and App Router
- Next.js 16 (Webpack, Turbopack) with Pages Router and App Router
- CDN (IIFE bundle)

**Run only e2e tests:**
```bash
# Build tests must run first
npm run build-platforms
# Then run e2e tests
npx playwright test
```

**What they verify:**
- Page loads without errors
- SDK auto-instruments correctly (expected number of spans created)
- Sessions can be manually ended and are sent to the server
- Logs can be manually sent to the server
- Sessions auto-end on:
  - Page visibility change (blur/focus)
  - Page navigation
  - Page refresh
  - Page close
- Server receives spans and logs with correct attributes

E2E tests run in three browsers:
- Chromium
- Firefox
- WebKit (Safari)

Test results are compared against golden files stored in `tests/__golden__/`.

## Golden Files

Golden files verify that SDK output matches the expected structure. They're stored in `tests/__golden__/` and organized by browser and test scenario (e.g., `chromium-next-15-webpack-app-session.json`).

Each test creates spans and logs with dynamic data (timestamps, IDs). Golden files ignore these fields during comparison:

**Span fields (ignored):**
- `traceId`
- `spanId`
- `startTimeUnixNano`
- `endTimeUnixNano`

**Log fields (ignored):**
- `timeUnixNano`
- `observedTimeUnixNano`

**Attributes (ignored):**
- `session.id`
- `log.record.uid`
- `emb.sdk_startup_duration`
- `emb.app_instance_id`

When SDK changes affect the test output, update golden files:

```bash
npm run test:integration:update-golden
```

Golden files are still recorded with actual values so you can verify the changes are intentional.

## Platform Setup

Each platform is a separate directory under `platforms/` with its own:
- `package.json` with build scripts
- `src/` directory with the test app
- `dist/` output (created during build tests)

### Dependencies

The parent `tests-integration` package is a workspace package and declares `@embrace-io/web-sdk` and `@embrace-io/web-cli` as workspace dependencies (using `*` wildcards).

Individual platform directories under `platforms/` are not workspace packages and use `file:` references:
```json
{
  "@embrace-io/web-sdk": "file:../../../../packages/web-sdk",
  "@embrace-io/web-cli": "file:../../../../packages/web-cli"
}
```

## Adding a New Platform

> **All paths in this section are relative to `tests/integration/`**

### Adding Build Tests

Create a new platform directory under `platforms/<platform-name>/` with a `package.json` containing these scripts:

```json
{
  "scripts": {
    "build": "npm run build:clean && npm run build:es2015",
    "build:clean": "npx rimraf dist .sonda",
    "build:es2015": "your-build-command && npm run process-sourcemaps",
    "process-sourcemaps": "embrace-web-cli upload -a NOEMB -p ./dist/es2015 --no-upload"
  }
}
```

Ensure the platform includes these dependencies:

```json
{
  "dependencies": {
    "@embrace-io/web-sdk": "file:../../../../packages/web-sdk"
  },
  "devDependencies": {
    "@embrace-io/web-cli": "file:../../../../packages/web-cli"
  }
}
```

Create a test file at `tests/build-platform/<platform-name>-tests.test.ts`:

```typescript
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPlatformBuildSmokeTest } from '../../utils/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformDir = resolve(__dirname, '../../platforms/<platform-name>');

await runPlatformBuildSmokeTest(platformDir, {
  targets: ['es2015'],
  platformName: '<platform-name>',
});
```

### Adding End-to-End Tests

1. **Add web server to `playwright.config.ts`:**

For non-Next.js platforms (Webpack, Vite), the built output is automatically served by the main API server at `http://localhost:3001/platforms/<platform-name>/<target>/index.html` (no server entry needed in playlist.config.ts).

For custom dev servers, add a web server entry to `playwright.config.ts`:

```typescript
{
  name: '<platform-name>',
  command: 'cd platforms/<platform-name> && npm run build && your-serve-command -p 3020',
  url: 'http://localhost:3020',
  reuseExistingServer: false,
}
```

2. **Create test file at `tests/e2e/<platform-name>-tests.spec.ts`:**

```typescript
import { runE2ETests } from '../../utils/index.ts';

runE2ETests({
  name: '<Platform Name> ES2015',
  url: 'http://localhost:3001/platforms/<platform-name>/es2015/index.html', // or custom server URL
  numberOfExpectedSpans: 3, // Adjust based on your app's auto-instrumentation
});
```

3. **Ensure the test app includes these buttons:**

```jsx
<button onClick={handleEndSession}>End Session</button>
<button onClick={handleSendLog}>Send Log</button>
<button onClick={handleNavigate}>Navigate to Another Page</button>
```

4. **Expose session ID on window:**

```javascript
window.EMBRACE_CURRENT_SESSION_ID = getCurrentSessionId();
```

## Troubleshooting

### Tests fail after SDK changes

Rebuild the SDK before running tests:
```bash
npm run build
npm run test:integration
```

### E2E tests timeout

Check that:
1. Build tests passed (required for e2e setup)
2. The correct number of spans is set in `numberOfExpectedSpans`
3. Required buttons are present and use correct labels
4. Session ID is exposed on `window.EMBRACE_CURRENT_SESSION_ID`

### Golden file mismatches

Verify intentional SDK changes, then update golden files:
```bash
npm run test:integration:update-golden
```

### Platform dependencies not linked

Ensure workspace dependencies are installed:
```bash
npm install
```

Then reinstall platform dependencies:
```bash
npm run install-dependencies
```
