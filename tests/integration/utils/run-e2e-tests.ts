import testWithMockApi, {
  expect as extendedMockApiTestExpect,
} from './test-with-mock-api.js';
import type { ReceivedSpans } from '../index.js';

const EXPECTED_SPAN_ENDED_TEXT =
  'EmbraceSessionBatchedSpanProcessor non-session span ended';

type E2ETestFixture = {
  getCurrentSessionId: () => Promise<string>;
  navigateAndWaitUntilReady: (
    url: string,
    numberOfExpectedSpans: number
  ) => Promise<void>;
  validateThatSessionEnded: (sessionId?: string) => Promise<void>;
};

const testE2E = testWithMockApi.extend<E2ETestFixture>({
  getCurrentSessionId: async ({ page }, use) => {
    await use(async () => {
      const sessionId = await page.evaluate(
        () => window.EMBRACE_CURRENT_SESSION_ID,
        {}
      );

      if (!sessionId) {
        throw new Error('Session ID is not available on the page');
      }

      return sessionId;
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
      page.on('console', msg => {
        if (msg.text().includes(EXPECTED_SPAN_ENDED_TEXT)) {
          autoInstrumentedSpansCount++;
        }
      });

      await page.goto(url);

      // Set a 5 seconds timeout for the page to load
      const timeout = setTimeout(() => {
        throw new Error('Page did not load within 5 seconds');
      }, 5000);

      await new Promise(resolve => {
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
  validateThatSessionEnded: async ({ getCurrentSessionId, page }, use) => {
    await use(async (sessionId?: string) => {
      const currentSessionId = sessionId || (await getCurrentSessionId());

      if (!page.isClosed()) {
        // Easy way of making sure the server registered the session end
        // If this gets flaky, we can increase the timeout or read the server logs
        await page.waitForTimeout(500); // Wait for 1 second to ensure the session is ended
      }

      const response = await fetch('http://localhost:3001/received-spans');
      const receivedSpans = (await response.json()) as ReceivedSpans;

      testE2E.expect(receivedSpans).toHaveProperty(currentSessionId);
    });
  },
});

type RunE2ETestsOptions = {
  url: string;
  name: string;
  numberOfExpectedSpans: number;
};

const runE2ETests = ({
  url,
  name,
  numberOfExpectedSpans,
}: RunE2ETestsOptions) => {
  const codifiedName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

  testE2E.describe(`${name} E2E Tests`, () => {
    // testE2E(
    //   'it should load the home page without errors',
    //   async ({ navigateAndWaitUntilReady }) => {
    //     await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
    //   }
    // );
    //
    // testE2E(
    //   'It should have the necessary buttons to test the page',
    //   async ({ page, navigateAndWaitUntilReady }) => {
    //     await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
    //
    //     await testE2E
    //       .expect(
    //         page.getByRole('button', {
    //           name: 'End Session',
    //         })
    //       )
    //       .toBeVisible();
    //     await testE2E
    //       .expect(page.getByRole('button', { name: 'Send Log' }))
    //       .toBeVisible();
    //     await testE2E
    //       .expect(
    //         page.getByRole('button', {
    //           name: 'Navigate to Another Page',
    //         })
    //       )
    //       .toBeVisible();
    //   }
    // );

    testE2E(
      'it should end a session and send a request to the API',
      async ({ requests, waitForRequest, navigateAndWaitUntilReady, page }) => {
        await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
        const button = page.getByRole('button', { name: 'End Session' });
        await button.click();
        await waitForRequest();

        testE2E.expect(requests).toHaveLength(1);
        extendedMockApiTestExpect(requests[0]).toMatchGoldenFile(
          `${codifiedName}-session.json`
        );
      }
    );
    //
    // testE2E(
    //   'it should send a log',
    //   async ({ page, requests, waitForRequest, navigateAndWaitUntilReady }) => {
    //     await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
    //
    //     const button = page.getByRole('button', { name: 'Send Log' });
    //     await button.click();
    //     await waitForRequest();
    //
    //     testE2E.expect(requests).toHaveLength(1);
    //     extendedMockApiTestExpect(requests[0]).toMatchGoldenFile(
    //       `${codifiedName}-send-log.json`
    //     );
    //   }
    // );
    //
    // testE2E(
    //   'it should end the session and send it to the API if the page closes',
    //   async ({
    //     navigateAndWaitUntilReady,
    //     page,
    //     validateThatSessionEnded,
    //     getCurrentSessionId,
    //   }) => {
    //     await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
    //     const currentSessionId = await getCurrentSessionId();
    //
    //     await page.close();
    //
    //     await validateThatSessionEnded(currentSessionId);
    //   }
    // );
    //
    // testE2E(
    //   'it should end the session and send it to the API if the page loses focus',
    //   async ({ navigateAndWaitUntilReady, page, validateThatSessionEnded }) => {
    //     await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
    //
    //     // Simulate losing focus by minimizing the page or changing the tab
    //     // Playwright runs every tab separately, so they don't behave like real browser tabs
    //     await page.evaluate(() => {
    //       Object.defineProperty(document, 'visibilityState', {
    //         value: 'hidden',
    //         writable: true,
    //       });
    //       window.dispatchEvent(new Event('visibilitychange'));
    //     });
    //
    //     await validateThatSessionEnded();
    //   }
    // );
    //
    // testE2E(
    //   'it should end the session and send it to the API if the page refreshes',
    //   async ({
    //     navigateAndWaitUntilReady,
    //     page,
    //     validateThatSessionEnded,
    //     getCurrentSessionId,
    //   }) => {
    //     await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
    //     const currentSessionId = await getCurrentSessionId();
    //
    //     await page.reload();
    //
    //     await validateThatSessionEnded(currentSessionId);
    //   }
    // );
    //
    // testE2E(
    //   'it should end the session and send it to the API if the user navigates to another page',
    //   async ({
    //     navigateAndWaitUntilReady,
    //     page,
    //     validateThatSessionEnded,
    //     getCurrentSessionId,
    //   }) => {
    //     await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
    //     const currentSessionId = await getCurrentSessionId();
    //
    //     const button = page.getByRole('button', {
    //       name: 'Navigate to Another Page',
    //     });
    //     await button.click();
    //
    //     await validateThatSessionEnded(currentSessionId);
    //   }
    // );
    //
    // testE2E(
    //   'it should end the session and send it to the API if the user navigates to another page via the browser bar',
    //   async ({
    //     navigateAndWaitUntilReady,
    //     page,
    //     validateThatSessionEnded,
    //     getCurrentSessionId,
    //   }) => {
    //     await navigateAndWaitUntilReady(url, numberOfExpectedSpans);
    //     const currentSessionId = await getCurrentSessionId();
    //
    //     // Simulate navigation by changing the URL directly
    //     // This is a workaround since Playwright does not support changing the URL bar directly
    //     // Not exactly the same as a user typing in the URL bar, but is the best we can do
    //     await page.goto('https://example.com');
    //
    //     await validateThatSessionEnded(currentSessionId);
    //   }
    // );
    //
    // testE2E.skip(
    //   '[REQUIRES MANUAL TESTING] it should end the session and send it to the API if the browser closes',
    //   async () => {
    //     // This test is skipped because Playwright does not support closing the browser programmatically
    //     // in a way that would trigger the session end. It requires manual intervention.
    //     // You can run this test manually by closing the browser after navigating to the page.
    //     // browser.close() kills the browser instance immediately, without triggering the session end.
    //     // await browser.close();
    //   }
    // );
  });
};

export default runE2ETests;
