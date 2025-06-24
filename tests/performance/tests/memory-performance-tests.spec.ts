import { cdpSessionTest } from '../utils/index.js';
import type { Metric, TestPage } from '../types/index.js';
import { BASE_URL, EMBRACE_API_REGEX, PAGES } from '../constants/index.js';
import { CDPSession } from 'playwright';

type MemoryResult = {
  heapSize: Metric;
};

const getHeapSize = async (cdpSession: CDPSession) => {
  await cdpSession.send('Performance.enable');
  const metrics = await cdpSession.send('Performance.getMetrics');
  const heap =
    metrics.metrics.find(m => m.name === 'JSHeapUsedSize')?.value ?? 0;
  return heap / 1024 / 1024; // convert to MB
};

const calculateMemoryDifference = (
  results: Partial<Record<TestPage, MemoryResult>>
) => {
  const baseline = results.baseline;
  const withSdk = results['with-sdk'];

  if (!baseline || !withSdk) {
    throw new Error(
      'Both baseline and with-sdk results are required for comparison.'
    );
  }

  return {
    heapSize: {
      value: withSdk.heapSize.value - baseline.heapSize.value,
      description: `Difference in Used JavaScript Heap Size: ${withSdk.heapSize.description}`,
    },
  };
};

cdpSessionTest.describe('Memory Performance Tests', () => {
  cdpSessionTest.beforeEach(async ({ context }) => {
    await context.route(EMBRACE_API_REGEX, route => {
      void route.fulfill({ status: 200, body: '0' });
    });
  });

  cdpSessionTest(`Tests Memory Usage`, async ({ page, cdpSession }) => {
    const results: Partial<Record<TestPage, MemoryResult>> = {};

    for (const testPage of Object.values(PAGES)) {
      const url = `${BASE_URL}${testPage.path}`;

      await page.goto(url);
      // Wait 10 seconds to allow the page to load and simulate usage
      await page.waitForTimeout(10000);

      const heapSize = await getHeapSize(cdpSession);

      results[testPage.name] = {
        heapSize: {
          value: heapSize,
          description: `Used JavaScript heap size in MB`,
        },
      };
    }

    const difference = calculateMemoryDifference(results);
    // TODO: add thresholds for each metric and fail the test if they are not met
    console.table(
      Object.values(difference).map(metric => ({
        Value: `${metric.value > 0 ? '+' : ''}${metric.value.toFixed(2)}`,
        Description: metric.description,
      }))
    );
  });
});
