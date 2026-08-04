// Headed-only test for the soft navigation polyfill. Run with:
//   npx playwright test --config playwright.config.headed.ts
//
// The polyfill is active when the browser does not support the native
// soft-navigation PerformanceObserver entry type. Chrome requires the
// --enable-features=SoftNavigationHeuristics flag for native support, so the
// polyfill fires automatically in a standard browser window.
//
// Headless Chromium does not generate PerformanceEventTiming entries for
// Playwright synthetic clicks, so this test must run in headed mode where real
// user interactions produce real entries.
import type { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import testWithMockApi from '../../utils/test-with-mock-api.ts';

const BASE_URL = 'http://localhost:3016';

type SPAFixture = {
  loadHome: () => Promise<void>;
  triggerSessionEnd: () => Promise<void>;
};

const test = testWithMockApi.extend<SPAFixture>({
  loadHome: async ({ page }, use) => {
    await use(async () => {
      await page.goto(BASE_URL);
      await page.waitForFunction(() =>
        window.EMBRACE_SDK?.session.getUserSessionId(),
      );
    });
  },

  triggerSessionEnd: async ({ setPageVisibility }, use) => {
    await use(async () => {
      await setPageVisibility('hidden');
    });
  },
});

test.describe('Soft Navigation Polyfill', () => {
  test('emits a Soft Navigation span with source=polyfill on link click', async ({
    page,
    loadHome,
    requests,
    triggerSessionEnd,
    validateThatSessionPartsEnded,
  }) => {
    await loadHome();

    // The polyfill emits its span once the click's event entry is delivered, so
    // gate on that rather than on a fixed delay. Registered before the click
    // rather than after, so the wait never depends on a past entry being
    // replayed to a late observer. The threshold has to be lowered because a
    // router that commits synchronously produces a very short event.
    const clickEntry = page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('no click event entry within 10s')),
            10_000,
          );
          new PerformanceObserver((list, observer) => {
            if (list.getEntries().some((entry) => entry.name === 'click')) {
              clearTimeout(timeout);
              observer.disconnect();
              resolve();
            }
          }).observe({ type: 'event', durationThreshold: 0 });
        }),
    );

    await page.getByRole('link', { name: 'Products' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();

    await clickEntry;

    await triggerSessionEnd();

    // 1 navigation + 1 session end = 2 session parts. Wait until the server
    // confirms both so that requests contains the second-part polyfill span.
    await validateThatSessionPartsEnded(2);

    const allSpans = requests.flatMap((r) =>
      ((r.data as IExportTraceServiceRequest).resourceSpans ?? [])
        .flatMap((rs) => rs.scopeSpans ?? [])
        .flatMap((ss) => ss.spans ?? []),
    );

    const polyfillSpan = allSpans.find(
      (span) =>
        span.name === 'Soft Navigation' &&
        span.attributes?.some(
          (a) =>
            a.key === 'emb.soft_navigation.source' &&
            a.value.stringValue === 'polyfill',
        ) &&
        span.attributes?.some(
          (a) =>
            a.key === 'browser.url.full' &&
            (a.value.stringValue ?? '').includes('/products'),
        ),
    );

    test
      .expect(
        polyfillSpan,
        'expected a polyfill Soft Navigation span for /products',
      )
      .toBeDefined();
    test
      .expect(
        polyfillSpan?.attributes?.find(
          (a) => a.key === 'emb.soft_navigation.source',
        )?.value.stringValue,
      )
      .toBe('polyfill');
    // A whole-number duration is serialized as intValue rather than doubleValue.
    const durationAttr = polyfillSpan?.attributes?.find(
      (a) => a.key === 'emb.soft_navigation.duration',
    )?.value;
    test
      .expect(durationAttr?.intValue ?? durationAttr?.doubleValue)
      .toBeGreaterThan(0);
  });
});
