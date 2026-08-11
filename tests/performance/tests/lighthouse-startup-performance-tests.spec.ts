import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from '@playwright/test';
import lighthouse from 'lighthouse';
import { chromium } from 'playwright';
import { resultsToMarkdownTable } from '../../utils/jsonToMarkdownTable.ts';
import {
  MAIN_THREAD_TIME_THRESHOLD_IN_MS,
  SCRIPT_EVAL_THRESHOLD_IN_MS,
  TOTAL_BLOCKING_TIME_THRESHOLD_IN_MS,
} from '../config/index.ts';
import { BASE_URL, EMBRACE_API_REGEX } from '../constants/index.ts';
import type { Metric, TestPage } from '../types/index.ts';

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

// Single lighthouse samples are too noisy for threshold checks: simulated
// throttling multiplies observed CPU time by 4x, so any scheduling blip on the
// runner is amplified. The median across runs rejects those outliers.
const LIGHTHOUSE_RUNS_PER_PAGE = 3;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const medianOfRuns = (runs: LighthouseResult[]): LighthouseResult => {
  const medianMetric = (
    metricName: keyof LighthouseResult,
  ): LighthouseMetric => ({
    value: median(runs.map((run) => run[metricName].value)),
    description: runs[0][metricName].description,
  });

  return {
    totalBlockingTime: medianMetric('totalBlockingTime'),
    mainThreadTime: medianMetric('mainThreadTime'),
    scriptEval: medianMetric('scriptEval'),
  };
};

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
      const url = `${BASE_URL}${page.path}`;
      const runs: LighthouseResult[] = [];

      for (
        let runNumber = 1;
        runNumber <= LIGHTHOUSE_RUNS_PER_PAGE;
        runNumber++
      ) {
        // Launch a new context for each run to ensure a clean slate: a shared
        // profile would carry user session storage into later runs
        const port = 60062;
        const userDataDir = path.join(os.tmpdir(), 'pw', String(Math.random()));
        const context = await chromium.launchPersistentContext(userDataDir, {
          args: [`--remote-debugging-port=${port.toString()}`],
        });

        await context.route(EMBRACE_API_REGEX, (route) => {
          console.log('faked request');

          void route.fulfill({ status: 200, body: '0' });
        });

        const outputPath = `./test-results/lighthouse-startup-performance-tests-${page.name}-run${runNumber.toString()}-lighthouse-report`;

        try {
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
          runs.push({
            totalBlockingTime: mapResultToMetric(audits['total-blocking-time']),
            mainThreadTime: mapResultToMetric(
              audits['mainthread-work-breakdown'],
            ),
            scriptEval: mapResultToMetric(audits['bootup-time']),
          });
        } finally {
          // The next run reuses the debugging port, so this context must be gone
          await context.close();
        }
      }

      // The per-run spread tells a noisy runner apart from a real regression
      console.log(
        `${page.name} main thread time per run: ${runs
          .map((run) => run.mainThreadTime.value.toFixed(1))
          .join(' / ')} ms`,
      );

      results[page.name] = medianOfRuns(runs);
    });
  }

  test.afterAll(() => {
    const difference = calculateDifference(results);
    const differenceInMetrics: Record<string, Metric[]> = {
      ...Object.entries(difference).reduce((acc, [key, metric]) => {
        acc[
          LIGHTHOUSE_METRIC_TO_HUMAN_READABLE[key as keyof LighthouseResult]
        ] = [
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
        ];
        return acc;
      }, {}),
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
