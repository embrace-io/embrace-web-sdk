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
      await page.waitForFunction(
        () => window.EMBRACE_CURRENT_USER_SESSION_ID !== null,
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

    await page.getByRole('link', { name: 'Products' }).click();
    await test
      .expect(page.getByRole('heading', { name: 'Products' }))
      .toBeVisible();

    await page.waitForTimeout(1000); // wait for the polyfill span to be emitted

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
    test
      .expect(
        polyfillSpan?.attributes?.find(
          (a) => a.key === 'emb.soft_navigation.duration',
        )?.value.doubleValue,
      )
      .toBeGreaterThan(0);
  });
});
