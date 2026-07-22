import type {
  IExportLogsServiceRequest,
  ILogRecord,
} from '@opentelemetry/otlp-transformer/build/esnext/logs/internal-types.js';
import {
  DEFAULT_LCP_DELAY_MS,
  MAIN_THREAD_BLOCK_MS,
} from '../../platforms/vite-test-harness/src/constants.ts';
import test, { expect } from '../../utils/test-with-mock-api.ts';

const BASE_URL = 'http://localhost:3017/';
const DELAYED_LCP_URL = `http://localhost:3017/lcp?delay=${DEFAULT_LCP_DELAY_MS}`;
const PAGE_A_URL = 'http://localhost:3017/a';
const PAGE_B_URL = 'http://localhost:3017/b';
const OBSERVER_DELAY_MS = 200;

// When asserting render times, give a buffer of 2 frames @ 30 fps
const RENDER_BUFFER = 67;

// When asserting main thread blocking times, add a small tolerance
const MAIN_THREAD_TOLERANCE = 20;

const attributeValue = (record: ILogRecord, key: string) => {
  const value = record.attributes.find(
    (attribute) => attribute.key === key,
  )?.value;

  return value?.stringValue ?? value?.intValue ?? value?.doubleValue;
};

test.describe('Web Vitals measurement in soft navigations', () => {
  test('emits web vital logs attributed to soft navigations', async ({
    page,
    requests,
    setPageVisibility,
    withRemoteConfig,
  }) => {
    await withRemoteConfig();
    await page.goto(BASE_URL);

    // LCP entries are only observed until the first input, so let the landing
    // page's paint reach the PerformanceObserver before interacting.
    await expect(page.getByText('This is the landing page')).toBeVisible();
    await page.waitForTimeout(OBSERVER_DELAY_MS);

    // Block the main thread so we can deterministically assert INP for the hard navigation.
    await page.getByTestId('block-main-thread').click();

    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const navigationTiming = await page.evaluate(
      () =>
        performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming,
    );

    const waitForSoftNavigationEntry = (url: string) =>
      page.evaluate(
        (expectedURL) =>
          new Promise<void>((resolve) => {
            new PerformanceObserver((list, observer) => {
              if (
                list.getEntries().some((entry) => entry.name === expectedURL)
              ) {
                observer.disconnect();
                resolve();
              }
            }).observe({ type: 'soft-navigation', buffered: true });
          }),
        url,
      );

    // Trigger a soft navigation with a delayed LCP, recording timestamps so we can assert that
    // the LCP log contains sensible values.
    const beforeLcpNavigation = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: 'Delayed LCP' }).click();
    await expect(page.getByText('renders a large image')).toBeVisible();
    await waitForSoftNavigationEntry(DELAYED_LCP_URL);
    await expect(page.getByAltText('Large logo for delayed LCP')).toBeVisible({
      timeout: DEFAULT_LCP_DELAY_MS * 3,
    });
    const afterImageRender = await page.evaluate(() => performance.now());

    // A short necessary timeout to ensure the LCP entry reaches the PerformanceObserver.
    await page.waitForTimeout(OBSERVER_DELAY_MS);

    // The image has already painted, so this only affects INP, not LCP.
    await page.getByTestId('block-main-thread').click();

    // Trigger another soft navigation, recording timestamps so we can bound Page A's paint metrics.
    const beforePageANavigation = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: 'Page A' }).click();
    await expect(page.getByText('You navigated to Page A')).toBeVisible();
    const afterPageARender = await page.evaluate(() => performance.now());
    await waitForSoftNavigationEntry(PAGE_A_URL);

    // Block the main thread and trigger a layout shift
    await page.getByTestId('block-main-thread').click();
    await page.getByTestId('trigger-layout-shift').click();
    await expect(page.getByText('Layout shift banner')).toBeVisible();
    await page.waitForTimeout(OBSERVER_DELAY_MS);

    // Trigger another soft navigation to finalise the previous soft navigation's metrics
    await page.getByRole('button', { name: 'Page B' }).click();
    await expect(page.getByText('You navigated to Page B')).toBeVisible();
    await waitForSoftNavigationEntry(PAGE_B_URL);

    // Hide the page to ensure the logs are flushed.
    await setPageVisibility('hidden');

    const webVitalRecords = () =>
      requests
        .filter((request) => request.url.endsWith('/v2/logs'))
        .flatMap(
          (request) =>
            (request.data as IExportLogsServiceRequest).resourceLogs ?? [],
        )
        .flatMap((resourceLogs) => resourceLogs.scopeLogs ?? [])
        .flatMap((scopeLogs) => scopeLogs.logRecords ?? [])
        .filter((record) => record.eventName === 'browser.web_vital');

    const recordsForURL = (url: string) =>
      webVitalRecords().filter(
        (record) => attributeValue(record, 'browser.url.full') === url,
      );

    const metricRecord = (url: string, name: string) =>
      recordsForURL(url).find(
        (record) => attributeValue(record, 'browser.web_vital.name') === name,
      );

    const metricValue = (record: ILogRecord | undefined) =>
      Number(attributeValue(record as ILogRecord, 'browser.web_vital.value'));

    // Note this is de-duplicated because CLS can emit several
    // records for one navigation as its value grows.
    const metricNames = (url: string) =>
      [
        ...new Set(
          recordsForURL(url).map((record) =>
            attributeValue(record, 'browser.web_vital.name'),
          ),
        ),
      ].sort();

    const navigationIds = (url: string) =>
      new Set(
        recordsForURL(url).map((record) =>
          attributeValue(record, 'browser.web_vital.navigation_id'),
        ),
      );

    // Wait until every navigation's full set of vitals has been flushed. The
    // sets are exact, so an unexpected extra metric fails with a full diff.
    await expect
      .poll(
        () => ({
          hardNav: metricNames(BASE_URL),
          delayedLcpNav: metricNames(DELAYED_LCP_URL),
          pageANav: metricNames(PAGE_A_URL),
        }),
        { timeout: 15_000 },
      )
      .toEqual({
        // The hard navigation is the only page that emits TTFB
        hardNav: ['cls', 'fcp', 'inp', 'lcp', 'ttfb'],
        delayedLcpNav: ['cls', 'fcp', 'inp', 'lcp'],
        pageANav: ['cls', 'fcp', 'inp', 'lcp'],
      });

    await test.step('all records are web vitals with valid ratings', () => {
      for (const record of webVitalRecords()) {
        expect(attributeValue(record, 'emb.type')).toBe('ux.web_vital');
        expect(['good', 'needs-improvement', 'poor']).toContain(
          attributeValue(record, 'browser.web_vital.rating'),
        );
      }
    });

    await test.step('hard navigation', () => {
      for (const record of recordsForURL(BASE_URL)) {
        expect(
          attributeValue(record, 'browser.web_vital.navigation_type'),
        ).toBe('navigate');
      }

      const ttfbValue = metricValue(metricRecord(BASE_URL, 'ttfb'));
      expect(ttfbValue).toBeGreaterThan(0);
      expect(ttfbValue).toBeLessThanOrEqual(navigationTiming.responseStart + 1);

      const fcpValue = metricValue(metricRecord(BASE_URL, 'fcp'));
      expect(fcpValue).toBeGreaterThan(0);
      expect(fcpValue).toBeLessThanOrEqual(beforeLcpNavigation);

      const lcpValue = metricValue(metricRecord(BASE_URL, 'lcp'));
      expect(lcpValue).toBeGreaterThan(0);
      expect(lcpValue).toBeLessThanOrEqual(beforeLcpNavigation);

      // INP includes input and presentation delay on top of the blocking time,
      // so the upper bound gets render headroom.
      const inpValue = metricValue(metricRecord(BASE_URL, 'inp'));
      expect(inpValue).toBeGreaterThanOrEqual(
        MAIN_THREAD_BLOCK_MS - MAIN_THREAD_TOLERANCE,
      );
      expect(inpValue).toBeLessThan(MAIN_THREAD_BLOCK_MS + RENDER_BUFFER);

      // With soft navigations enabled, the hard navigation also gets a
      // navigation ID, shared by all of its records.
      const ids = navigationIds(BASE_URL);
      expect(ids.size).toBe(1);
      expect([...ids][0]).not.toBeUndefined();
    });

    await test.step('soft navigation to the delayed LCP page', () => {
      for (const record of recordsForURL(DELAYED_LCP_URL)) {
        expect(
          attributeValue(record, 'browser.web_vital.navigation_type'),
        ).toBe('soft-navigation');
      }

      // FCP should be the initial render of the soft navigation.
      const fcpValue = metricValue(metricRecord(DELAYED_LCP_URL, 'fcp'));
      expect(fcpValue).toBeGreaterThan(0);
      expect(fcpValue).toBeLessThanOrEqual(DEFAULT_LCP_DELAY_MS);

      // LCP should be the delayed image. The value itself is relative to the soft nav start.
      const lcpRecord = metricRecord(DELAYED_LCP_URL, 'lcp') as ILogRecord;
      const lcpValue = metricValue(lcpRecord);
      expect(lcpValue).toBeGreaterThanOrEqual(
        DEFAULT_LCP_DELAY_MS - RENDER_BUFFER,
      );
      expect(lcpValue).toBeLessThanOrEqual(
        afterImageRender - beforeLcpNavigation,
      );

      // The LCP log timestamp is the absolute time.
      const lcpTimestampMs = Number(lcpRecord.timeUnixNano) / 1e6;
      expect(lcpTimestampMs).toBeGreaterThanOrEqual(
        timeOrigin + beforeLcpNavigation + DEFAULT_LCP_DELAY_MS - RENDER_BUFFER,
      );
      expect(lcpTimestampMs).toBeLessThanOrEqual(
        timeOrigin + afterImageRender + RENDER_BUFFER,
      );

      const inpValue = metricValue(metricRecord(DELAYED_LCP_URL, 'inp'));
      expect(inpValue).toBeGreaterThanOrEqual(
        MAIN_THREAD_BLOCK_MS - MAIN_THREAD_TOLERANCE,
      );
      expect(inpValue).toBeLessThan(MAIN_THREAD_BLOCK_MS + RENDER_BUFFER);

      // All of this navigation's records share one valid navigation ID.
      const ids = navigationIds(DELAYED_LCP_URL);
      expect(ids.size).toBe(1);
      expect([...ids][0]).not.toBeUndefined();
    });

    await test.step('soft navigation to Page A', () => {
      for (const record of recordsForURL(PAGE_A_URL)) {
        expect(
          attributeValue(record, 'browser.web_vital.navigation_type'),
        ).toBe('soft-navigation');
      }

      // FCP and LCP are both the immediate render of Page A's text content.
      const fcpValue = metricValue(metricRecord(PAGE_A_URL, 'fcp'));
      expect(fcpValue).toBeGreaterThan(0);
      expect(fcpValue).toBeLessThanOrEqual(
        afterPageARender - beforePageANavigation,
      );

      const lcpValue = metricValue(metricRecord(PAGE_A_URL, 'lcp'));
      expect(lcpValue).toBeGreaterThan(0);
      expect(lcpValue).toBeLessThanOrEqual(
        afterPageARender - beforePageANavigation,
      );

      const inpValue = metricValue(metricRecord(PAGE_A_URL, 'inp'));
      expect(inpValue).toBeGreaterThanOrEqual(
        MAIN_THREAD_BLOCK_MS - MAIN_THREAD_TOLERANCE,
      );
      expect(inpValue).toBeLessThan(MAIN_THREAD_BLOCK_MS + RENDER_BUFFER);

      // The banner insertion shifted the content below it.
      const clsValue = metricValue(metricRecord(PAGE_A_URL, 'cls'));
      expect(clsValue).toBeGreaterThan(0);

      // A single navigation ID, distinct from the delayed LCP page's.
      const ids = navigationIds(PAGE_A_URL);
      expect(ids.size).toBe(1);
      expect(ids).not.toEqual(navigationIds(DELAYED_LCP_URL));
    });
  });
});
