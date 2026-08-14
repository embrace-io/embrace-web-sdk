import { expectDefined } from './expectDefined.ts';
import testWithMockApi, {
  expect as extendedMockApiTestExpect,
  logRecordsOf,
} from './test-with-mock-api.ts';

const EXPECTED_SPAN_ENDED_TEXT =
  'EmbraceSessionPartBatchedSpanProcessor non-session-part span ended';
// OTel's floor for error-level records. Exceptions and log.message(_, 'error')
// land here; every instrumentation the SDK ships emits below it.
// https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
const SEVERITY_NUMBER_ERROR = 17;
const TEST_LOG_MESSAGE = 'This is a test log message';
const MAX_SCROLL_DEPTH_EVENT_NAME = 'max-scroll-depth';
const WEB_VITAL_NAME_ATTRIBUTE_KEY = 'browser.web_vital.name';
const LCP_WEB_VITAL_NAME = 'lcp';
const FIRST_INTERACTION_EVENT_NAME = 'first-interaction';

type E2ETestFixture = {
  waitUntilSpanLogged: () => Promise<void>;
  navigateAndWaitUntilReady: (
    url: string,
    numberOfExpectedSpans: number,
  ) => Promise<void>;
};

const testE2E = testWithMockApi.extend<E2ETestFixture>({
  waitUntilSpanLogged: async ({ page }, use) => {
    await use(async () => {
      let spanLogged = false;
      page.on('console', (msg) => {
        if (msg.text().includes(EXPECTED_SPAN_ENDED_TEXT)) {
          spanLogged = true;
        }
      });

      // Set a 5 seconds timeout for the span to be logged
      const timeout = setTimeout(() => {
        throw new Error('Span was not logged within 5 seconds');
      }, 5000);

      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (spanLogged) {
            clearInterval(interval);
            clearTimeout(timeout);
            resolve(null);
          }
        }, 100);
      });
    });
  },

  navigateAndWaitUntilReady: async ({ page }, use) => {
    await use(async (url: string, numberOfExpectedSpans: number) => {
      let autoInstrumentedSpansCount = 0;
      // This depends on the SDK logging
      // "EmbraceSessionPartBatchedSpanProcessor non-session-part span ended"
      // when a span ends, and it is waiting for a fixed number of auto-instrumented spans to be created on page load
      // Adding more spans or changing the number of spans may require adjusting the test expectations
      // But it's better than waiting a random amount of time for everything to settle
      page.on('console', (msg) => {
        if (msg.text().includes(EXPECTED_SPAN_ENDED_TEXT)) {
          autoInstrumentedSpansCount++;
        }
      });

      await page.goto(url);

      // Set a 5 seconds timeout for the page to load
      const timeout = setTimeout(() => {
        throw new Error('Page did not load within 5 seconds');
      }, 5000);

      await new Promise((resolve) => {
        const interval = setInterval(() => {
          if (autoInstrumentedSpansCount >= numberOfExpectedSpans) {
            clearInterval(interval);
            clearTimeout(timeout);
            resolve(null);
          }
        }, 100);
      });
    });
  },
});

type RunE2ETestsOptions = {
  url: string;
  name: string;
  numberOfExpectedSpans: number;
  // When true, golden file snapshots are recorded and compared for this platform.
  // Enable selectively to avoid maintaining redundant snapshots across platforms
  // that produce equivalent SDK output.
  goldenFiles?: boolean;
};

const runE2ETests = ({
  url,
  name,
  numberOfExpectedSpans,
  goldenFiles = false,
}: RunE2ETestsOptions) => {
  const codifiedName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

  testE2E.describe(`${name} E2E Tests`, () => {
    testE2E(
      'it should load the home page without errors',
      async ({ navigateAndWaitUntilReady }) => {
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
      },
    );

    testE2E(
      'It should have the necessary buttons to test the page',
      async ({ page, navigateAndWaitUntilReady }) => {
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);

        await testE2E
          .expect(
            page.getByRole('button', {
              name: 'End Session',
            }),
          )
          .toBeVisible();
        await testE2E
          .expect(page.getByRole('button', { name: 'Send Log' }))
          .toBeVisible();
        await testE2E
          .expect(
            page.getByRole('button', {
              name: 'Navigate to Another Page',
            }),
          )
          .toBeVisible();
      },
    );

    testE2E(
      'it should end a session and send a request to the API',
      async ({
        requests,
        waitForOTelRequestMatching,
        navigateAndWaitUntilReady,
        page,
        browserName,
      }) => {
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const button = page.getByRole('button', { name: 'End Session' });
        await button.click();
        // Wait until the session span is present in `requests` (after gunzip).
        // Web vitals log requests may arrive first, so waiting for any OTel
        // request is not sufficient.
        await waitForOTelRequestMatching(/\/v2\/spans/);

        // Give a short window for the concurrent log request (sent alongside the
        // span flush) to finish being parsed from the gzip buffer.
        if (!requests.find((req) => req.url.endsWith('/logs'))) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const sessionRequest = requests.find((req) =>
          req.url.endsWith('/spans'),
        );
        // Web vitals may have flushed a log request before session end; use the
        // last log request which corresponds to the session end flush.
        const logRequest = requests.find((req) => req.url.endsWith('/logs'));

        if (goldenFiles) {
          if (!sessionRequest) {
            throw new Error('Session request was not sent to the API');
          }

          if (!logRequest) {
            throw new Error('Log request was not sent to the API');
          }

          extendedMockApiTestExpect(sessionRequest).toMatchGoldenFile(
            `${browserName}-${codifiedName}-session.json`,
          );
          extendedMockApiTestExpect(logRequest).toMatchGoldenFile(
            `${browserName}-${codifiedName}-log.json`,
          );
        }
      },
    );

    testE2E(
      'it should send a log',
      async ({
        page,
        requests,
        waitForOTelRequest,
        navigateAndWaitUntilReady,
        browserName,
      }) => {
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);

        const button = page.getByRole('button', { name: 'Send Log' });
        await button.click();
        await waitForOTelRequest();

        testE2E.expect(requests).toHaveLength(1);
        if (goldenFiles) {
          extendedMockApiTestExpect(
            expectDefined(requests[0]),
          ).toMatchGoldenFile(`${browserName}-${codifiedName}-send-log.json`);
        }
      },
    );

    testE2E(
      'it should fetch the remote config',
      async ({ page, waitForRemoteConfigRequest, withRemoteConfig }) => {
        await withRemoteConfig();
        await Promise.all([page.goto(url), waitForRemoteConfigRequest()]);
      },
    );

    testE2E(
      'it should init on first load then skip init on reload once remote config samples the device out',
      async ({
        page,
        navigateAndWaitUntilReady,
        withRemoteConfig,
        getCurrentUserSessionId,
      }) => {
        await withRemoteConfig({
          threshold: 0,
        });
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);

        // First load works as expected as we don't wait for the remote config to be applied
        testE2E.expect(await getCurrentUserSessionId()).toHaveLength(32);

        await page.reload();

        // Sampled out, so initSDK bails and returns false before building a
        // control object, leaving the harness with nothing to expose.
        const sdkInitialized = await page.evaluate(
          () => window.EMBRACE_SDK !== undefined,
        );
        testE2E.expect(sdkInitialized).toBe(false);
      },
    );

    testE2E(
      'it should end the session and send it to the API if the page closes',
      async ({
        navigateAndWaitUntilReady,
        page,
        validateThatSessionPartsEnded,
        getCurrentUserSessionId,
        browserName,
      }) => {
        testE2E.skip(browserName === 'webkit', 'Skipping on WebKit');
        testE2E.skip(browserName === 'firefox', 'Skipping on Firefox');

        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const currentUserSessionId = await getCurrentUserSessionId();

        await page.close();

        await validateThatSessionPartsEnded(1, currentUserSessionId);
      },
    );

    testE2E(
      'it should end the session and send it to the API if the page loses focus',
      async ({
        navigateAndWaitUntilReady,
        page,
        validateThatSessionPartsEnded,
      }) => {
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);

        // Simulate losing focus by minimizing the page or changing the tab
        // Playwright runs every tab separately, so they don't behave like real browser tabs
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            value: 'hidden',
            writable: true,
          });
          document.dispatchEvent(new Event('visibilitychange'));
        });

        await validateThatSessionPartsEnded();
      },
    );

    testE2E(
      'it should end the session and send it to the API if the page refreshes',
      async ({
        navigateAndWaitUntilReady,
        page,
        validateThatSessionPartsEnded,
        getCurrentUserSessionId,
        browserName,
      }) => {
        testE2E.skip(browserName === 'firefox', 'Skipping on Firefox');

        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const currentUserSessionId = await getCurrentUserSessionId();

        await page.reload();

        await validateThatSessionPartsEnded(1, currentUserSessionId);
      },
    );

    testE2E(
      'it should end the session and send it to the API if the user navigates to another page',
      async ({
        navigateAndWaitUntilReady,
        page,
        validateThatSessionPartsEnded,
        getCurrentUserSessionId,
        browserName,
      }) => {
        testE2E.skip(browserName === 'webkit', 'Skipping on WebKit');

        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const currentUserSessionId = await getCurrentUserSessionId();

        const button = page.getByRole('button', {
          name: 'Navigate to Another Page',
        });
        await button.click();

        await validateThatSessionPartsEnded(1, currentUserSessionId);
      },
    );

    testE2E(
      'it should end the session and send it to the API if the user navigates to another page via the browser bar',
      async ({
        navigateAndWaitUntilReady,
        page,
        validateThatSessionPartsEnded,
        getCurrentUserSessionId,
        browserName,
      }) => {
        testE2E.skip(browserName === 'webkit', 'Skipping on WebKit');

        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const currentUserSessionId = await getCurrentUserSessionId();

        // Simulate navigation by changing the URL directly
        // This is a workaround since Playwright does not support changing the URL bar directly
        // Not exactly the same as a user typing in the URL bar, but is the best we can do
        await page.goto('about:blank');

        await validateThatSessionPartsEnded(1, currentUserSessionId);
      },
    );

    testE2E(
      'it should handle instrumenting a fetch that responds with 204 and a body',
      async ({
        page,
        waitForOTelRequestMatching,
        waitForLogRecordMatching,
        withSimulatedResponse,
        navigateAndWaitUntilReady,
        waitUntilSpanLogged,
        getLogRecords,
        requests,
        browserName,
      }) => {
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        await withSimulatedResponse({
          body: 'something',
          status: 204,
        });
        await page
          .getByRole('button', {
            name: 'Make Fetch Request',
          })
          .click();

        // Wait for the network span to be logged for the fetch request
        await waitUntilSpanLogged();

        await page.getByRole('button', { name: 'Send Log' }).click();
        const logRecord = await waitForLogRecordMatching(
          'the manual log',
          (record) => record.body?.stringValue === TEST_LOG_MESSAGE,
        );

        // A 204 carrying a body is not an error. The batch is FIFO, so the manual
        // log arriving proves everything the fetch emitted has been exported too.
        testE2E
          .expect(
            getLogRecords().filter(
              (record) => (record.severityNumber ?? 0) >= SEVERITY_NUMBER_ERROR,
            ),
          )
          .toEqual([]);

        if (goldenFiles) {
          extendedMockApiTestExpect(
            expectDefined(requests[0]),
          ).toMatchGoldenFile(
            `${browserName}-${codifiedName}-handle-204-with-body-logs.json`,
          );

          extendedMockApiTestExpect(logRecord).toMatchGoldenLogRecord(
            `${browserName}-${codifiedName}-handle-204-with-body-log-record.json`,
          );

          // lcp exists only after web-vitals finalizes it on the first
          // interaction, so this test is where it can be goldened.
          const lcpRecord = await waitForLogRecordMatching(
            'the lcp web vital',
            (record) =>
              record.attributes.some(
                (attribute) =>
                  attribute.key === WEB_VITAL_NAME_ATTRIBUTE_KEY &&
                  attribute.value.stringValue === LCP_WEB_VITAL_NAME,
              ),
          );
          extendedMockApiTestExpect(lcpRecord).toMatchGoldenLogRecord(
            `${browserName}-${codifiedName}-lcp-web-vital-record.json`,
          );

          const firstInteractionRecord = await waitForLogRecordMatching(
            'the first-interaction record',
            (record) => record.eventName === FIRST_INTERACTION_EVENT_NAME,
          );
          extendedMockApiTestExpect(
            firstInteractionRecord,
          ).toMatchGoldenLogRecord(
            `${browserName}-${codifiedName}-first-interaction-record.json`,

          );
        }

        await page.getByRole('button', { name: 'End Session' }).click();
        await waitForOTelRequestMatching(/\/v2\/spans/);
        await waitForLogRecordMatching(
          'the part-end max-scroll-depth record',
          (record) => record.eventName === MAX_SCROLL_DEPTH_EVENT_NAME,
        );

        // Non-session-part spans are held until the part ends, so the session end
        // accounts for every span request in the run.
        const sessionPartRequests = requests.filter((request) =>
          request.url.endsWith('/spans'),
        );
        testE2E.expect(sessionPartRequests).toHaveLength(1);

        if (goldenFiles) {
          const partEndLogRequest = requests.find((request) =>
            logRecordsOf(request).some(
              (record) => record.eventName === MAX_SCROLL_DEPTH_EVENT_NAME,
            ),
          );

          if (!partEndLogRequest) {
            throw new Error('Part end log request was not sent to the API');
          }

          extendedMockApiTestExpect(
            expectDefined(requests[1]),
          ).toMatchGoldenFile(
            `${browserName}-${codifiedName}-handle-204-with-body-session.json`,
          );
          extendedMockApiTestExpect(
            expectDefined(requests[2]),
          ).toMatchGoldenFile(
            `${browserName}-${codifiedName}-handle-204-with-body-logs-after-part.json`,
          );

          // Should contain a span capturing the fetch request
          extendedMockApiTestExpect(sessionPartRequests[0]).toMatchGoldenFile(
            `${browserName}-${codifiedName}-handle-204-with-body-session.json`,
          );
          extendedMockApiTestExpect(partEndLogRequest).toMatchGoldenFile(
            `${browserName}-${codifiedName}-handle-204-with-body-logs-after-part.json`,
          );
            `${browserName}-${codifiedName}-handle-204-with-body-logs-after-part.json`,
          );
        }
      },
    );

    testE2E.skip(
      '[REQUIRES MANUAL TESTING] it should end the session and send it to the API if the browser closes',
      async () => {
        // This test is skipped because Playwright does not support closing the browser programmatically
        // in a way that would trigger the session end. It requires manual intervention.
        // You can run this test manually by closing the browser after navigating to the page.
        // browser.close() kills the browser instance immediately, without triggering the session end.
        // await browser.close();
      },
    );
  });
};

export default runE2ETests;
