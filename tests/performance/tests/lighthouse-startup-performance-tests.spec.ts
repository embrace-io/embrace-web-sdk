import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from '@playwright/test';
import getPort from 'get-port';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { resultsToMarkdownTable } from '../../utils/index.js';
import {
  MAIN_THREAD_TIME_THRESHOLD_IN_MS,
  SCRIPT_EVAL_THRESHOLD_IN_MS,
  TOTAL_BLOCKING_TIME_THRESHOLD_IN_MS,
} from '../config/index.js';
import { BASE_URL, EMBRACE_API_REGEX } from '../constants/index.js';
import type { Metric, TestPage } from '../types/index.js';

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
const METRIC_HUMAN_READABLE_TO_THRESHOLD_MAP: Record<string, number> = {
  'Total Blocking Time': TOTAL_BLOCKING_TIME_THRESHOLD_IN_MS,
  'Main Thread Time': MAIN_THREAD_TIME_THRESHOLD_IN_MS,
  'Script Evaluation Time': SCRIPT_EVAL_THRESHOLD_IN_MS,
};

const mapResultToMetric = (result: AuditResult): LighthouseMetric => ({
  value: result.numericValue ?? 0,
  description: result.description || '',
});

const calculateDifference = (
  results: Partial<Record<TestPage, LighthouseResult>>,
) => {
  const baseline = results.baseline;
  const withSdk = results['with-sdk'];

  if (!baseline || !withSdk) {
    throw new Error(
      'Both baseline and with-sdk results are required for comparison.',
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

      await context.route(EMBRACE_API_REGEX, (route) => {
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
        JSON.stringify(result.lhr, null, 2),
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
      ...Object.entries(difference).reduce(
        (acc, [key, metric]) => ({
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
        }),
        {},
      ),
    };

    fs.writeFileSync(
      './test-results/lighthouse-startup-performance-tests.md',
      resultsToMarkdownTable(differenceInMetrics),
    );

    // Check thresholds
    for (const [metricName, metric] of Object.entries(difference)) {
      const name =
        LIGHTHOUSE_METRIC_TO_HUMAN_READABLE[
          metricName as keyof LighthouseResult
        ];

      test
        .expect(
          metric.value <= METRIC_HUMAN_READABLE_TO_THRESHOLD_MAP[name],
          `Threshold exceeded for ${name}: ${metric.value} ms (threshold: ${METRIC_HUMAN_READABLE_TO_THRESHOLD_MAP[name]} ms)`,
        )
        .toBeTruthy();
    }

    // TODO: add thresholds for each metric and fail the test if they are not met
    console.table(
      Object.values(difference).map((metric) => ({
        Value: `${metric.value > 0 ? '+' : ''}${metric.value.toFixed(2)}ms`,
        Description: metric.description,
      })),
    );
  });
});
