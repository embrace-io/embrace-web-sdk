// Headed-only test for the native soft navigation path. Run with:
//   npx playwright test --config playwright.config.headed.ts
//
// Requires Chrome launched with --enable-features=SoftNavigationHeuristics so
// that the browser reports soft-navigation PerformanceObserver entries. The
// playwright.config.headed.ts chromium-soft-nav-heuristics project supplies
// that flag automatically.
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

  triggerSessionEnd: async ({ page }, use) => {
    await use(async () => {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'hidden',
          writable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    });
  },
});

test.describe('Soft Navigation Native', () => {
  test('emits a Soft Navigation span with source=performance_observer on link click', async ({
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

    // Give the browser time to deliver the soft-navigation entry via
    // PerformanceObserver before the session flush.
    await page.waitForTimeout(1000);

    await triggerSessionEnd();

    // 1 navigation + 1 session end = 2 session parts. Wait until the server
    // confirms both so that requests contains the second-part native span.
    await validateThatSessionPartsEnded(2);

    const allSpans = requests.flatMap((r) =>
      ((r.data as IExportTraceServiceRequest).resourceSpans ?? [])
        .flatMap((rs) => rs.scopeSpans ?? [])
        .flatMap((ss) => ss.spans ?? []),
    );

    const nativeSpan = allSpans.find(
      (span) =>
        span.name === 'Soft Navigation' &&
        span.attributes?.some(
          (a) =>
            a.key === 'emb.soft_navigation.source' &&
            a.value.stringValue === 'performance_observer',
        ) &&
        span.attributes?.some(
          (a) =>
            a.key === 'browser.url.full' &&
            (a.value.stringValue ?? '').includes('/products'),
        ),
    );

    test
      .expect(
        nativeSpan,
        'expected a native Soft Navigation span for /products',
      )
      .toBeDefined();
    test
      .expect(
        nativeSpan?.attributes?.find(
          (a) => a.key === 'emb.soft_navigation.source',
        )?.value.stringValue,
      )
      .toBe('performance_observer');
    // Chrome reports timing values as whole-number milliseconds, so OTLP
    // serializes them as intValue rather than doubleValue.
    const durationAttr = nativeSpan?.attributes?.find(
      (a) => a.key === 'emb.soft_navigation.duration',
    )?.value;
    test
      .expect(
        durationAttr?.intValue ?? durationAttr?.doubleValue,
        'expected emb.soft_navigation.duration to be a positive number',
      )
      .toBeGreaterThan(0);
    const paintTimeAttr = nativeSpan?.attributes?.find(
      (a) => a.key === 'emb.soft_navigation.paint_time',
    )?.value;
    test
      .expect(
        paintTimeAttr?.intValue ?? paintTimeAttr?.doubleValue,
        'expected emb.soft_navigation.paint_time to be a positive number',
      )
      .toBeGreaterThan(0);
    const presentationTimeAttr = nativeSpan?.attributes?.find(
      (a) => a.key === 'emb.soft_navigation.presentation_time',
    )?.value;
    test
      .expect(
        presentationTimeAttr?.intValue ?? presentationTimeAttr?.doubleValue,
        'expected emb.soft_navigation.presentation_time to be a positive number',
      )
      .toBeGreaterThan(0);
  });
});
