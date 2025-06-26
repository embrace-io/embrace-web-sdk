import lighthouse from 'lighthouse';
import type { Metric, TestPage } from '../types/index.js';
import { BASE_URL, EMBRACE_API_REGEX } from '../constants/index.js';
import fs from 'node:fs';
import { test } from '@playwright/test';
import getPort from 'get-port';
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import { resultsToMarkdownTable } from '../utils/index.js';

type AuditResult = {
  numericValue?: number;
  description?: string;
};
type LighthouseMetric = {
  value: number;
  description: string;
};
type LighthouseResult = {
  totalBlockingTime: LighthouseMetric;
  mainThreadTime: LighthouseMetric;
  scriptEval: LighthouseMetric;
};

const LIGHTHOUSE_METRIC_TO_HUMAN_READABLE: Record<
  keyof LighthouseResult,
  string
> = {
  totalBlockingTime: 'Total Blocking Time',
  mainThreadTime: 'Main Thread Time',
  scriptEval: 'Script Evaluation Time',
};
const PAGES: Record<TestPage, { name: TestPage; path: string }> = {
  baseline: {
    name: 'baseline',
    path: '/lighthouse-test.html',
  },
  'with-sdk': {
    name: 'with-sdk',
    path: '/lighthouse-test.html?use_sdk=true',
  },
};

const mapResultToMetric = (result: AuditResult): LighthouseMetric => ({
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

test.describe('Lighthouse Performance Tests', () => {
  const results: Partial<Record<TestPage, LighthouseResult>> = {};

  for (const page of Object.values(PAGES)) {
    test(`Run lighthouse for ${page.name}`, async () => {
      // Launch a new context for each test to ensure a clean slate
      const port = await getPort();
      const userDataDir = path.join(os.tmpdir(), 'pw', String(Math.random()));
      const context = await chromium.launchPersistentContext(userDataDir, {
        args: [`--remote-debugging-port=${port.toString()}`],
      });

      await context.route(EMBRACE_API_REGEX, route => {
        console.log('faked request');

        void route.fulfill({ status: 200, body: '0' });
      });

      const url = `${BASE_URL}${page.path}`;
      const outputPath = `./test-results/lighthouse-startup-performance-tests-${page.name}-lighthouse-report`;

      const result = await lighthouse(url, {
        port,
        output: ['json', 'html'],
        onlyCategories: ['performance'],
        pauseAfterLoadMs: 5000,
      });

      test.expect(result).toBeDefined();

      if (!result) {
        return;
      }

      fs.writeFileSync(
        `${outputPath}.json`,
        JSON.stringify(result.lhr, null, 2)
      );
      fs.writeFileSync(`${outputPath}.html`, result.report[1]);

      const audits = result.lhr.audits;
      results[page.name] = {
        totalBlockingTime: mapResultToMetric(audits['total-blocking-time']),
        mainThreadTime: mapResultToMetric(audits['mainthread-work-breakdown']),
        scriptEval: mapResultToMetric(audits['bootup-time']),
      };
    });
  }

  test.afterAll(() => {
    const difference = calculateDifference(results);
    const differenceInMetrics: Record<string, Metric[]> = {
      ...Object.entries(difference).reduce((acc, [key, metric]) => {
        return {
          ...acc,
          [LIGHTHOUSE_METRIC_TO_HUMAN_READABLE[key as keyof LighthouseResult]]:
            [
              {
                value: metric.value,
                name: 'Difference',
                unit: 'ms',
              },
              {
                value: metric.description,
                name: 'Description',
                unit: '',
              },
            ],
        };
      }, {}),
    };

    fs.writeFileSync(
      './test-results/lighthouse-startup-performance-tests.md',
      resultsToMarkdownTable(differenceInMetrics)
    );

    // TODO: add thresholds for each metric and fail the test if they are not met
    console.table(
      Object.values(difference).map(metric => ({
        Value: `${metric.value > 0 ? '+' : ''}${metric.value.toFixed(2)}ms`,
        Description: metric.description,
      }))
    );
  });
});
