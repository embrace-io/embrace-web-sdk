import type { ReceivedSpans } from '../index.ts';
import testWithMockApi, {
  expect as extendedMockApiTestExpect,
} from './test-with-mock-api.ts';

const EXPECTED_SPAN_ENDED_TEXT =
  'EmbraceSessionBatchedSpanProcessor non-session span ended';

type E2ETestFixture = {
  getCurrentSessionId: () => Promise<string>;
  waitUntilSpanLogged: () => Promise<void>;
  navigateAndWaitUntilReady: (
    url: string,
    numberOfExpectedSpans: number,
  ) => Promise<void>;
  validateThatSessionEnded: (sessionId?: string) => Promise<void>;
};

const testE2E = testWithMockApi.extend<E2ETestFixture>({
  getCurrentSessionId: async ({ page }, use) => {
    await use(async () => {
      const sessionId = await page.evaluate(
        () => window.EMBRACE_CURRENT_SESSION_ID,
        {},
      );

      if (!sessionId) {
        throw new Error('Session ID is not available on the page');
      }

      return sessionId;
    });
  },

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
      // "EmbraceSessionBatchedSpanProcessor non-session span ended"
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
  validateThatSessionEnded: async ({ getCurrentSessionId }, use) => {
    await use(async (sessionId?: string) => {
      const currentSessionId = sessionId || (await getCurrentSessionId());

      // Easy way of making sure the server registered the session end
      // If this gets flaky, we can increase the timeout or read the server logs
      const timeout = setTimeout(() => {
        throw new Error('Server did not register the session end in time');
      }, 4000);

      await new Promise((resolve) => {
        const interval = setInterval(() => {
          void (async () => {
            const response = await fetch(
              'http://localhost:3001/received-spans',
            );
            const receivedSpans = (await response.json()) as ReceivedSpans;

            if (receivedSpans[currentSessionId]) {
              clearInterval(interval);
              clearTimeout(timeout);
              resolve(null);
            }
          })();
        }, 200);
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
        waitForOTelRequest,
        navigateAndWaitUntilReady,
        page,
        browserName,
      }) => {
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const button = page.getByRole('button', { name: 'End Session' });
        await button.click();
        await waitForOTelRequest();

        const expectedSessionRequests = browserName === 'chromium' ? 2 : 1;
        if (requests.length < expectedSessionRequests) {
          // Small hack to avoid some flakiness where sometimes the response has returned but `requests` was not
          // yet populated
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        testE2E.expect(requests).toHaveLength(expectedSessionRequests);

        if (goldenFiles) {
          extendedMockApiTestExpect(requests[0]).toMatchGoldenFile(
            `${browserName}-${codifiedName}-session.json`,
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
          extendedMockApiTestExpect(requests[0]).toMatchGoldenFile(
            `${browserName}-${codifiedName}-send-log.json`,
          );
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
      'it should init the SDK if it is sampled out by remote config',
      async ({
        page,
        navigateAndWaitUntilReady,
        withRemoteConfig,
        getCurrentSessionId,
      }) => {
        await withRemoteConfig({
          threshold: 0,
        });
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        let currentSessionId: string | null = await getCurrentSessionId();

        // First load works as expected as we don't wait for the remote config to be applied
        testE2E.expect(currentSessionId).toHaveLength(32);

        await page.reload();

        // After reload, the session id should not be set as it is sampled out
        currentSessionId = await page.evaluate(
          () => window.EMBRACE_CURRENT_SESSION_ID,
          {},
        );
        testE2E.expect(currentSessionId).toBeNull();
      },
    );

    testE2E(
      'it should end the session and send it to the API if the page closes',
      async ({
        navigateAndWaitUntilReady,
        page,
        validateThatSessionEnded,
        getCurrentSessionId,
        browserName,
      }) => {
        testE2E.skip(browserName === 'webkit', 'Skipping on WebKit');
        testE2E.skip(browserName === 'firefox', 'Skipping on Firefox');

        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const currentSessionId = await getCurrentSessionId();

        await page.close();

        await validateThatSessionEnded(currentSessionId);
      },
    );

    testE2E(
      'it should end the session and send it to the API if the page loses focus',
      async ({ navigateAndWaitUntilReady, page, validateThatSessionEnded }) => {
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);

        // Simulate losing focus by minimizing the page or changing the tab
        // Playwright runs every tab separately, so they don't behave like real browser tabs
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            value: 'hidden',
            writable: true,
          });
          window.dispatchEvent(new Event('visibilitychange'));
        });

        await validateThatSessionEnded();
      },
    );

    testE2E(
      'it should end the session and send it to the API if the page refreshes',
      async ({
        navigateAndWaitUntilReady,
        page,
        validateThatSessionEnded,
        getCurrentSessionId,
        browserName,
      }) => {
        testE2E.skip(browserName === 'firefox', 'Skipping on Firefox');

        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const currentSessionId = await getCurrentSessionId();

        await page.reload();

        await validateThatSessionEnded(currentSessionId);
      },
    );

    testE2E(
      'it should end the session and send it to the API if the user navigates to another page',
      async ({
        navigateAndWaitUntilReady,
        page,
        validateThatSessionEnded,
        getCurrentSessionId,
        browserName,
      }) => {
        testE2E.skip(browserName === 'webkit', 'Skipping on WebKit');

        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const currentSessionId = await getCurrentSessionId();

        const button = page.getByRole('button', {
          name: 'Navigate to Another Page',
        });
        await button.click();

        await validateThatSessionEnded(currentSessionId);
      },
    );

    testE2E(
      'it should end the session and send it to the API if the user navigates to another page via the browser bar',
      async ({
        navigateAndWaitUntilReady,
        page,
        validateThatSessionEnded,
        getCurrentSessionId,
        browserName,
      }) => {
        testE2E.skip(browserName === 'webkit', 'Skipping on WebKit');

        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const currentSessionId = await getCurrentSessionId();

        // Simulate navigation by changing the URL directly
        // This is a workaround since Playwright does not support changing the URL bar directly
        // Not exactly the same as a user typing in the URL bar, but is the best we can do
        await page.goto('about:blank');

        await validateThatSessionEnded(currentSessionId);
      },
    );

    testE2E(
      'it should handle instrumenting a fetch that responds with 204 and a body',
      async ({
        page,
        waitForOTelRequest,
        withSimulatedResponse,
        navigateAndWaitUntilReady,
        waitUntilSpanLogged,
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
        await waitForOTelRequest();

        testE2E.expect(requests).toHaveLength(1);
        // The request should contain just a single log from clicking 'Send Log' and not any exception generated
        // from the fetch request
        if (goldenFiles) {
          extendedMockApiTestExpect(requests[0]).toMatchGoldenFile(
            `${browserName}-${codifiedName}-handle-204-with-body-logs.json`,
          );
        }

        await page.getByRole('button', { name: 'End Session' }).click();
        await waitForOTelRequest();

        const expected204Requests = browserName === 'chromium' ? 3 : 2;
        if (requests.length < expected204Requests) {
          // Small hack to avoid some flakiness where sometimes the response has returned but `requests` was not
          // yet populated
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        testE2E.expect(requests).toHaveLength(expected204Requests);
        // Should contain a span capturing the fetch request
        if (goldenFiles) {
          extendedMockApiTestExpect(requests[1]).toMatchGoldenFile(
            `${browserName}-${codifiedName}-handle-204-with-body-session.json`,
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
