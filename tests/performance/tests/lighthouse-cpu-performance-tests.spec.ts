import { lighthouseTest } from '../utils/index.js';
import lighthouse from 'lighthouse';
import type { Metric, TestPage } from '../types/index.js';
import { BASE_URL, EMBRACE_API_REGEX, PAGES } from '../constants/index.js';

type AuditResult = {
  numericValue?: number;
  description?: string;
};
type LighthouseResult = {
  totalBlockingTime: Metric;
  mainThreadTime: Metric;
  scriptEval: Metric;
};

const mapResultToMetric = (result: AuditResult): Metric => ({
  value: result.numericValue ?? 0,
  description: result.description || '',
});

const calculateDifference = (
  results: Partial<Record<TestPage, LighthouseResult>>
) => {
  const baseline = results.baseline;
  const withSdk = results['with-sdk'];

  if (!baseline || !withSdk) {
    throw new Error(
      'Both baseline and with-sdk results are required for comparison.'
    );
  }

  return {
    totalBlockingTime: {
      value: withSdk.totalBlockingTime.value - baseline.totalBlockingTime.value,
      description: `Difference in Total Blocking Time: ${withSdk.totalBlockingTime.description}`,
    },
    mainThreadTime: {
      value: withSdk.mainThreadTime.value - baseline.mainThreadTime.value,
      description: `Difference in Main Thread Time: ${withSdk.mainThreadTime.description}`,
    },
    scriptEval: {
      value: withSdk.scriptEval.value - baseline.scriptEval.value,
      description: `Difference in Script Evaluation Time: ${withSdk.scriptEval.description}`,
    },
  };
};

lighthouseTest.describe('Lighthouse CPU Performance Tests', () => {
  lighthouseTest.beforeEach(async ({ context }) => {
    await context.route(EMBRACE_API_REGEX, route => {
      void route.fulfill({ status: 200, body: '0' });
    });
  });

  lighthouseTest(`Tests CPU Utilization`, async ({ port }) => {
    const results: Partial<Record<TestPage, LighthouseResult>> = {};

    for (const page of Object.values(PAGES)) {
      const url = `${BASE_URL}${page.path}`;

      const result = await lighthouse(url, {
        port,
        output: ['json', 'html'],
        onlyCategories: ['performance'],
        pauseAfterLoadMs: 5000,
      });

      if (!result) {
        continue;
      }

      const audits = result.lhr.audits;
      results[page.name] = {
        totalBlockingTime: mapResultToMetric(audits['total-blocking-time']),
        mainThreadTime: mapResultToMetric(audits['mainthread-work-breakdown']),
        scriptEval: mapResultToMetric(audits['bootup-time']),
      };
    }

    const difference = calculateDifference(results);
    // TODO: add thresholds for each metric and fail the test if they are not met
    console.table(
      Object.values(difference).map(metric => ({
        Value: `${metric.value > 0 ? '+' : ''}${metric.value.toFixed(2)}ms`,
        Description: metric.description,
      }))
    );
  });
});
