# Embrace Web SDK Integration Tests

## Running Integration Tests

To run the integration tests, first ensure you have the necessary dependencies
installed. You can do this by running:

```bash
npm install
```

Also install dependencies for each platform you want to test:

```bash
cd platforms/<platform> && npm install
```

If you need to install all of them you can instead run the following from the
repo root:

```bash
sdk:test:integration:e2e:install-dependencies
```

There are two kinds of integration tests:

1. **Build Tests**: These tests verify that the SDKs can be built correctly for
   each platform. Optionally, they check the size of the built SDKs and ensure
   they meet the expected criteria. The results of these tests are stored in
   `tests/integration/build-test-results/`.

2. **End-to-End Tests**: These tests are run against the built SDKs to ensure
   they work as expected in a real-world scenario. A local server is started,
   and the SDK is configured to point to this server. The tests then verify that
   the SDK can send events and that the server receives them correctly.

End-to-End tests will run the following scenarios:

1. **Page Load**: Index page loads without any errors.
2. **Session Sent**: A session is sent to the server when manually ended.
3. **Log Sent**: A log is sent to the server when manually triggered.
4. **Automatic Session End**: A session is automatically ended after:
   - The page closes.
   - Page loses focus: manually tested by sending a `visibilitychange` event to
     the page.
   - Page refresh.
   - Navigating to another page by clicking a button.
   - Navigating to another page externally: simulated by using page.goto method
     in Playwright.

To run the integration tests, use the following commands:

```bash
npm run tests:integration:build # This will run the build tests for all platforms
npm run tests:integration:e2e # This will run the end-to-end tests for all platforms
```

**Note**: The end-to-end tests require that all platforms have been built
successfully, by running the build tests first. Also make sure that if you have
made local changes to the SDK that you are running against those latest updates
by rebuilding the SDK:

```bash
npm run sdk:compile
```

### Golden Files

The integration tests use golden files to verify the expected output of the SDKs
against a previous run. These files are stored in the
`tests/integration/golden-files/` directory. When running the tests, the output
is compared against these golden files to ensure that the SDKs behave as
expected.

Since every run will produce new spans and logs, each with a new unique ID,
timestamp and other dynamic data, comparison is done only on the static parts of
the output.

These span fields are ignored during the comparison:

- traceId
- spanId
- startTimeUnixNano
- endTimeUnixNano

These log fields are ignored during the comparison:

- timeUnixNano
- observedTimeUnixNano

These attributes are ignored during the comparison:

- session.id
- log.record.uid
- emb.sdk_startup_duration
- emb.app_instance_id

Some instrumentation may also produce a non-deterministic list of spans or logs,
for these we only compare the amount of spans or logs, not their content:

- DocumentLoadInstrumentation

If your changes to the SDK affect the output of the tests, you will need to
update the golden files by running

```bash
npm run tests:integration:e2e:update-golden
```

Even though these fields are ignored during the comparison, they are recorded in
the golden files, so you can see the actual values that were produced during the
test run. That also means that if you need to update the golden files, you will
see that the values of these fields have changed, which is expected.

## Adding a new platform

Anything can be added as a platform, as long as it outputs the necessary files
and commands to run the integration tests.

### Adding Build Tests Support

If you want to add support for build tests for a new platform, you can use the
`runPlatformBuildSmokeTest` test suite.

For example:

```typescript
await runPlatformBuildSmokeTest(platformDir, {
  targets: ['esnext', 'es2015'],
  platformName: 'webpack-5',
});
```

For this test suite to work, the platform directory must contain a
`package.json` file with the following scripts:

```json
{
  "scripts": {
    "build:clean": "your-clean-command",
    "build:<target_1>": "your-build-command-for_target_1",
    "build:<target_2>": "your-build-command_for_target_2",
    "build:<target_n>": "your-build-command_for_target_n"
  }
}
```

Additionally, if you want the bundle size to be checked, you need to use Sonda
to generate the bundle size report. A report is needed for each target you want
to test, and it should be placed in
`tests/integration/<platform>/.sonda/<target>/sonda_0.json`

If you also generate the HTML report, place it in the same folder and it will be
uploaded to the test results artifacts in GitHub Actions.

### Adding End-to-End Tests Support

To add support for end-to-end tests for a new platform, you can use the
`runPlatformE2ETest` test suite.

For example:

```typescript
await runE2ETests({
  name: 'Vite 7 ES2015',
  url: 'http://localhost:3001/public/vite-7/es2015/index.html',
  numberOfExpectedSpans: 4,
});
```

These test run under the assumption that the platform will have a `dist` folder
with each target's output, including an `index.html` file that can be served by
a local server. `runPlatformBuildSmokeTest` will take care of building the
platform, generating the `dist` folder and copying it to the correct location.
They can be accessed by the end-to-end tests using the following URL:

```
`http://localhost:3001/public/<platform>/<target>/index.html`
```

In there, tests will wait for the page to load, counting the amount of spans
created by the SDK auto-instrumentation. Since each platform may build
differently, you need to specify the expected number of spans in the
`numberOfExpectedSpans` parameter. We did this in order to avoid having to set
up fixed wait times for each platform, which would make the tests slower and
less reliable.

The page needs to render a set of buttons that will trigger the SDK:

- **End Session**: This button will end the current session span. Required
  label: `End Session`.
- **Send Log**: This button will send a log message to the server. Required
  label: `Send Log`.
- **Navigate to Another Page**: This button will navigate to another page,
  simulating a user action. Required label: `Navigate to Another Page`.

For example:

```typescript jsx
import React from 'react';
import { session, log } from '@embrace-io/web-sdk';
import { sdkControl } from './otel';

const SDKTest = () => {
  const handleEndSession = async () => {
    session.endSessionSpan();

    if (sdkControl) {
      await sdkControl.flush();
    }
  };

  const handleSendLog = async () => {
    log.message('This is a test log message', 'info');

    if (sdkControl) {
      await sdkControl.flush();
    }
  };

  const handleNavigateToAnotherPage = () => {
    window.location.href = 'https://example.com';
  };

  return (
    <section>
      <button onClick={handleEndSession}>End Session</button>
      <button onClick={handleSendLog}>Send Log</button>
      <button onClick={handleNavigateToAnotherPage}>
        Navigate to Another Page
      </button>
    </section>
  );
};

export default SDKTest;

```

### Current Platform Support

The following platforms are currently supported for integration tests:

| Platform                   | Build Tests | End-to-End Tests |
| -------------------------- | ----------- | ---------------- |
| Webpack 4 (es2015)         | ✅          | ✅               |
| Webpack 5 (esnext, es2020) | ✅          | ✅               |
| Vite 7 (esnext, es2020)    | ✅          | ✅               |
| Next Latest (es2020)       | ✅          | ✅               |
