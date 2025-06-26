import type { Metric, TestPage } from '../types/index.js';
import { BASE_URL, EMBRACE_API_REGEX } from '../constants/index.js';
import type { CDPSession } from 'playwright';
import { chromium } from 'playwright';
import fs from 'node:fs';
import type { Page } from '@playwright/test';
import zlib from 'node:zlib';
import { test } from '@playwright/test';
import getPort from 'get-port';
import { resultsToMarkdownTable } from '../utils';

type PerformanceMetric = 'taskDuration' | 'scriptDuration' | 'heapUsedSize';
type PerformanceSnapshot = Record<PerformanceMetric, number>;
type Results = Record<TestPage, Record<string, PerformanceSnapshot>>;
type Step = {
  name: string;
  selector: string;
};

const PAGES: Record<TestPage, { name: TestPage; path: string }> = {
  baseline: {
    name: 'baseline',
    path: '/performance-test.html',
  },
  'with-sdk': {
    name: 'with-sdk',
    path: '/performance-test.html?use_sdk=true',
  },
};

const TRACING_CATEGORIES = [
  'devtools.timeline', // General timeline events (DOM events, script execution, layout)
  'v8', // V8 runtime events (compiler, GC scheduling, memory)
  'v8.execute', // JS execution-specific events (function calls, evals)
  'blink', // Blink rendering engine events (styles, layout, paint)
  'blink.user_timing', // User Timing API events (performance.mark/measure)
  'loading', // Resource loading events (network requests, parsing)
  'netlog', // Detailed network request logging (URL, status, timing)
  'longtask', // Long task API events (blocked main thread >50ms)
  'navigation', // Navigation events (redirects, page load start/end)
  'disabled-by-default-v8.gc', // GC (Garbage Collection) phases and timing
  'disabled-by-default-devtools.timeline', // High-res timing of all timeline events (JS, paint, etc.)
  'disabled-by-default-devtools.timeline.stack', // Adds JavaScript stack traces to timeline events
  'disabled-by-default-memory-infra', // Memory dumps, allocation tracking (heap, malloc, etc.)
  'toplevel', // Top-level script/task entries (e.g. first-level JS exec)
];

const METRIC_NAME_UNIT_MAP: Record<PerformanceMetric, string> = {
  scriptDuration: 'ms',
  taskDuration: 'ms',
  heapUsedSize: 'MB',
};
const METRIC_NAME_TO_HUMAN_READABLE_MAP: Record<PerformanceMetric, string> = {
  scriptDuration: 'Script Duration',
  taskDuration: 'Task Duration',
  heapUsedSize: 'Heap Used Size',
};
const METRIC_HUMAN_READABLE_TO_UNIT_MAP: Record<string, string> = {
  'Script Duration': 'ms',
  'Task Duration': 'ms',
  'Heap Used Size': 'MB',
  'Number of Requests': ' requests',
  'Size of Requests': 'KB',
};

const startTrace = async (cdpSession: CDPSession) => {
  await cdpSession.send('Tracing.start', {
    categories: TRACING_CATEGORIES.join(','),
    transferMode: 'ReportEvents',
    options: 'record-as-much-as-possible',
  });
};

const waitForPageToBeIdle = async (page: Page) => {
  await page.waitForFunction(() => {
    const appState = document.getElementById('appState');
    return appState && appState.textContent === 'idle';
  });
};

const getPerformanceSnapshot = async (
  cdpSession: CDPSession
): Promise<PerformanceSnapshot> => {
  /**
   * Performance.getMetrics exposes the following metrics
   *
   * Timestamp: The timestamp when the metrics sample was taken.
   * Documents: Number of documents on the page.
   * Frames: Number of frames on the page.
   * JSEventListeners: Number of events on the page.
   * Nodes: Number of DOM nodes on the page.
   * LayoutCount: The total number of full or partial page layouts.
   * RecalcStyleCount: The total number of page style recalculations.
   * LayoutDuration: Combined durations of all page layouts.
   * RecalcStyleDuration: Combined duration of all page style recalculations.
   * ScriptDuration: Combined duration of JavaScript execution.
   * TaskDuration: Combined duration of all tasks performed by the browser.
   * JSHeapUsedSize : Used JavaScript heap size.
   * JSHeapTotalSize : Total JavaScript heap size.
   */
  const raw = await cdpSession.send('Performance.getMetrics');
  const metrics = Object.fromEntries(raw.metrics.map(m => [m.name, m.value]));

  // To capture new metrics, you can add them to the object below
  // Remember to add the new metric to PerformanceMetric and METRIC_HUMAN_READABLE_TO_UNIT_MAP
  // No need to change the rest of the test
  return {
    // Transform s to ms
    scriptDuration: metrics.ScriptDuration * 1000 || 0,
    // Transform s to ms
    taskDuration: metrics.TaskDuration * 1000 || 0,
    // Transform bytes to MB
    heapUsedSize: (metrics.JSHeapUsedSize || 0) / 1024 / 1024,
  };
};

const calculateDifference = (results: Results) =>
  Object.entries(results['with-sdk']).reduce<Record<string, Metric[]>>(
    (acc, [step, value]) => ({
      ...acc,
      [step]: Object.entries(value).map(([metricName, metricValue]) => ({
        value:
          metricValue - results.baseline[step][metricName as PerformanceMetric],
        name: METRIC_NAME_TO_HUMAN_READABLE_MAP[
          metricName as PerformanceMetric
        ],
        unit: METRIC_NAME_UNIT_MAP[metricName as PerformanceMetric],
      })),
    }),
    {}
  );

const STEPS: Step[] = [
  {
    name: 'Generate 100 fetch requests',
    selector: '#startFetchRequestTest',
  },
  {
    name: 'Generate 100 XHR requests',
    selector: '#startXHRRequestTest',
  },
  {
    name: 'Click 100 buttons and generate 100 logs',
    selector: '#startButtonClickTest',
  },
  {
    name: 'Throw a 100 exceptions',
    selector: '#startExceptionTest',
  },
  {
    name: 'End Session',
    selector: '#endSession',
  },
];

test.describe('CDP Performance Tests', () => {
  const results: Results = {
    baseline: {},
    'with-sdk': {},
  };
  let numberOfRequests = 0;
  let sizeOfRequests = 0;

  for (const testPage of Object.values(PAGES)) {
    test(`Tests Performance for ${testPage.name}`, async () => {
      // Start a new context on each test to make sure we have a clean slate
      const port = await getPort();
      const chromeBrowser = await chromium.launch({
        args: [`--remote-debugging-port=${port.toString()}`],
        headless: true,
      });
      const context = await chromeBrowser.newContext();
      const page = await context.newPage();
      const cdpSession = await context.newCDPSession(page);

      await context.route(EMBRACE_API_REGEX, async route => {
        const buffer = route.request().postDataBuffer();

        if (!buffer) {
          console.warn('Invalid request from SDK');
          await route.fulfill({ status: 200, body: '0' });
          return;
        }

        numberOfRequests++;
        sizeOfRequests += buffer.length;

        // Decompress the gzipped data
        zlib.gunzip(buffer, (err, result) => {
          if (err) {
            console.error('Failed to decompress request from SDK:', err);
          } else {
            try {
              const json = result.toString('utf-8');

              fs.writeFileSync(
                `./test-results/cdp-performance-tests-${new Date().getTime().toString()}-request.json`,
                JSON.stringify(JSON.parse(json), null, 2)
              );
            } catch (e) {
              console.error('Failed to save JSON:', e);
            }
          }
        });

        await route.fulfill({ status: 200, body: '0' });
      });

      await cdpSession.send('Performance.enable');

      const url = `${BASE_URL}${testPage.path}`;
      const outputPath = `./test-results/cdp-performance-tests-${testPage.name}-tracing.json`;

      const traceEvents: unknown[] = [];
      cdpSession.on('Tracing.dataCollected', event => {
        traceEvents.push(...event.value);
      });

      await page.goto(url);
      await waitForPageToBeIdle(page);

      results[testPage.name]['Page Loaded'] =
        await getPerformanceSnapshot(cdpSession);

      await startTrace(cdpSession);

      let previousSnapshot = results[testPage.name]['Page Loaded'];

      for (const step of STEPS) {
        await page.click(step.selector);
        await waitForPageToBeIdle(page);

        await cdpSession.send('Tracing.requestMemoryDump');
        const afterSnapshot = await getPerformanceSnapshot(cdpSession);

        results[testPage.name][step.name] = {
          scriptDuration:
            afterSnapshot.scriptDuration - previousSnapshot.scriptDuration,
          taskDuration:
            afterSnapshot.taskDuration - previousSnapshot.taskDuration,
          heapUsedSize: afterSnapshot.heapUsedSize, // not cumulative
        };

        previousSnapshot = afterSnapshot;
      }

      await page.waitForTimeout(1000); // Give it some time to settle
      await cdpSession.send('Tracing.end');

      await new Promise(resolve =>
        cdpSession.once('Tracing.tracingComplete', resolve)
      );

      const traceJson = {
        traceEvents,
      };

      fs.writeFileSync(outputPath, JSON.stringify(traceJson, null, 2));

      await context.close();
    });
  }

  test.afterAll(() => {
    const difference: Record<string, Metric[]> = {
      Requests: [
        {
          name: 'Number of Requests',
          value: numberOfRequests,
          unit: ' requests',
        },
        {
          name: 'Size of Requests',
          value: sizeOfRequests / 1024, // Convert to KB
          unit: 'KB',
        },
      ],
      ...calculateDifference(results),
    };

    const total = Object.values(difference).reduce<Record<string, number>>(
      (acc, metrics) => ({
        ...acc,
        ...Object.fromEntries(
          metrics.map(metric => [
            metric.name,
            (acc[metric.name] ?? 0) + metric.value,
          ])
        ),
      }),
      {}
    );
    difference['Total'] = Object.entries(total).map(([name, value]) => ({
      name,
      value,
      unit: METRIC_HUMAN_READABLE_TO_UNIT_MAP[name],
    }));

    fs.writeFileSync(
      './test-results/cdp-performance-tests.md',
      resultsToMarkdownTable(difference)
    );

    // TODO: add thresholds for each metric and fail the test if they are not met
    console.table([
      ...Object.entries(difference).map(([step, metrics]) => ({
        Step: step,
        ...Object.values(metrics).reduce(
          (acc, metric) => ({
            ...acc,
            [metric.name]: `${metric.value > 0 ? '+' : ''}${metric.value.toFixed(
              2
            )}${metric.unit}`,
          }),
          {}
        ),
      })),
    ]);
  });
});
