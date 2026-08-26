import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import type {
  IKeyValue,
  Resource,
} from '@opentelemetry/otlp-transformer/build/esnext/common/internal-types.js';
import type {
  IExportLogsServiceRequest,
  ILogRecord,
  IResourceLogs,
  IScopeLogs,
} from '@opentelemetry/otlp-transformer/build/esnext/logs/internal-types.js';
import type {
  IEvent,
  IExportTraceServiceRequest,
  IResourceSpans,
  IScopeSpans,
  ISpan,
} from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types.js';
import { test as base } from '@playwright/test';
import chalk from 'chalk';
import { diff } from 'jest-diff';
import type { Request, Route } from 'playwright';
import type { ReceivedSpans } from '../types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GOLDEN_DIR = path.resolve(__dirname, '../tests/__golden__');
const INTENDED_CHANGE_MESSAGE = `\n\nIf you intended to change the golden files, run test:integration:update-golden instead.`;
const shouldUpdateGolden = process.env['UPDATE_GOLDEN'] === '1';
const DEFAULT_REMOTE_CONFIG: Record<string, unknown> = {
  threshold: 100, // Default to 100% for tests
};
const LOG_RECORD_TIMEOUT_MS = 5_000;
const OTEL_REQUEST_REGEX = /http:\/\/localhost:3001\/v2\/(spans|logs)$/;
const REMOTE_CONFIG_REGEX = /^https?:\/\/.*\/v2\/config\?.*/;
const SIMULATED_REQUEST_REGEX = /simulated/;
// Next.js build hashes make the full path non-deterministic for internal manifest fetches,
// so skip exact comparison when both URLs end with the same filename
const URL_ATTRIBUTE_KEYS = new Set(['http.url', 'url.full']);
const NEXTJS_URL_SUFFIX_REGEX = /\/_clientMiddlewareManifest\.json$/;

// Every platform harness hangs its initSDK return value here, since
// page.evaluate cannot reach the bundle's module scope. Typed from source
// rather than the built package so a typecheck does not require a build.
declare global {
  interface Window {
    EMBRACE_SDK: Exclude<
      ReturnType<
        typeof import('../../../packages/web-sdk/src/index.ts').initSDK
      >,
      false
    >;
  }
}

export type EmbraceDataRequest = {
  url: string;
  headers: Record<string, string>;
  data: Record<string, unknown>;
};

type SimulatedResponse = {
  body: string;
  status: number;
};

type TestWithMockApi = {
  requests: EmbraceDataRequest[];
  waitForRequest: (url: RegExp) => Promise<void>;
  waitForOTelRequest: (count?: number) => Promise<void>;
  waitForOTelRequestMatching: (pattern: RegExp) => Promise<void>;
  waitForLogRecordMatching: (
    description: string,
    predicate: (logRecord: ILogRecord) => boolean,
  ) => Promise<ILogRecord>;
  getLogRecords: () => ILogRecord[];
  waitForRemoteConfigRequest: () => Promise<void>;
  withRemoteConfig: (remoteConfig?: Record<string, unknown>) => Promise<void>;
  withSimulatedResponse: (response: SimulatedResponse) => Promise<void>;
  setPageVisibility: (visibilityState: 'visible' | 'hidden') => Promise<void>;
  getCurrentUserSessionId: () => Promise<string>;
  validateThatSessionPartsEnded: (
    expectedCount?: number,
    userSessionId?: string,
  ) => Promise<void>;
};

// Instrumentation on this list will only compare that the same amount of spans
// are created, but not their attributes, since there's no way of ordering them properly to match the previous results.
const INSTRUMENTATION_WITH_SIMPLIFIED_COMPARISON = [
  'DocumentLoadInstrumentation',
];
// Scopes on this list have their entities sorted by a stable key before
// comparison because the order they are emitted is non-deterministic.
const SCOPES_WITH_SORTED_COMPARISON = new Set(['WebVitalsInstrumentation']);
// If a log record has any of these attribute keys, its body is excluded from
// comparison because the content (e.g. raw attribution timing values) changes every run.
const LOGS_WITH_IGNORED_BODY = new Set(['browser.web_vital.name']);
// Resource spans whose url.full matches any of these patterns are excluded from
// comparison entirely. Favicons are fetched asynchronously by the browser and
// may or may not complete before the SDK captures PerformanceResourceTiming
// entries, making their presence in a session non-deterministic. The SDK's own
// uploads are instrumented like any other fetch, so whether one has resolved by
// the time the part flushes depends on how fast the test got there.
const EXCLUDED_RESOURCE_URL_PATTERNS = [/favicon\.ico$/, /\/v2\/(logs|spans)$/];
const IGNORED_ATTRIBUTES_LIST = [
  'log.record.uid',
  'emb.sdk_startup_duration',
  'emb.sdk_load_timestamp',
  'emb.sdk_init_timestamp',
  'emb.app_instance_id',
  // UUIDs and timestamps regenerated on every run; compare key presence only.
  'emb.session_part_id',
  'emb.user_session_id',
  'emb.user_session_previous_id',
  'emb.user_session_start_ts',
  // CI runs on Linux, devs might use different OS, thus different user agent
  'user_agent.original',
  'emb.stacktrace.js',
  'emb.js_file_bundle_ids',
  'emb.web_vital.attribution.elementRenderDelay',
  // FCP is reported when the browser delivers the PerformanceObserver entry,
  // which can fire before or after document.readyState reaches 'complete'
  // depending on render timing. The value oscillates between 'dom-interactive'
  // and 'complete' across CI runs.
  'emb.web_vital.attribution.loadState',
  'emb.web_vital.attribution.timeToFirstByte',
  'emb.web_vital.attribution.redirect',
  'emb.web_vital.attribution.domainLookup',
  'emb.web_vital.attribution.tcpConnection',
  'emb.web_vital.attribution.tlsNegotiation',
  'emb.web_vital.attribution.serverResponse',
  'emb.web_vital.attribution.unattributed',
  'emb.web_vital.attribution.waitingDuration',
  'emb.web_vital.attribution.cacheDuration',
  'emb.web_vital.attribution.dnsDuration',
  'emb.web_vital.attribution.connectionDuration',
  'emb.web_vital.attribution.requestDuration',
  'emb.web_vital.attribution.firstByteToFCP',
  'emb.web_vital.attribution.resourceLoadDelay',
  'emb.web_vital.attribution.resourceLoadDuration',
  'emb.web_vital.delta',
  'emb.web_vital.id',
  'emb.web_vital.value',
  'browser.web_vital.delta',
  'browser.web_vital.id',
  'browser.web_vital.navigation_id',
  'browser.web_vital.value',
  'tap.coords',
  'first_interaction.x',
  'first_interaction.y',
  'first_interaction.time',
  'app.surface.id',
  'dom_state.images_above_fold.timestamp',
];

// Which export batch a record rides in depends on where the processor's batch
// window fell, so tests address records by content rather than request index.
export const logRecordsOf = (request: EmbraceDataRequest): ILogRecord[] => {
  if (!request.url.endsWith('/logs')) {
    return [];
  }

  const { resourceLogs = [] } = request.data as IExportLogsServiceRequest;

  return resourceLogs.flatMap((resourceLog) =>
    resourceLog.scopeLogs.flatMap((scopeLog) => scopeLog.logRecords ?? []),
  );
};

const testWithMockApi = base.extend<TestWithMockApi>({
  waitForRequest: [
    async ({ page }, use) => {
      await use(async (url) => {
        await page.waitForResponse(
          (response) => response.url().match(url) !== null,
        );
      });
    },
    { scope: 'test' },
  ],
  waitForOTelRequest: [
    // `requests` only holds OTel requests, so wait on the recorded buffer
    // rather than the network event. A per-test cursor resolves on a new
    // request without short-circuiting on one an earlier call consumed.
    async ({ requests }, use, testInfo) => {
      let consumed = 0;
      await use(async (count = 1) => {
        await expect
          .poll(() => requests.length, { timeout: testInfo.timeout })
          .toBeGreaterThanOrEqual(consumed + count);
        consumed += count;
      });
    },
    { scope: 'test' },
  ],
  waitForOTelRequestMatching: [
    async ({ requests }, use) => {
      await use(async (pattern: RegExp) => {
        const timeoutMs = 10_000;
        const start = Date.now();
        await new Promise<void>((resolve, reject) => {
          const interval = setInterval(() => {
            if (requests.some((r) => pattern.test(r.url))) {
              clearInterval(interval);
              resolve();
            } else if (Date.now() - start > timeoutMs) {
              clearInterval(interval);
              reject(
                new Error(
                  `Expected OTel request matching ${pattern.toString()} within ${timeoutMs.toString()}ms`,
                ),
              );
            }
          }, 100);
        });
      });
    },
    { scope: 'test' },
  ],
  waitForLogRecordMatching: [
    async ({ requests }, use) => {
      await use(async (description, predicate) => {
        const matches = await new Promise<ILogRecord[]>((resolve, reject) => {
          const start = Date.now();
          const interval = setInterval(() => {
            const records = requests.flatMap(logRecordsOf);
            const found = records.filter(predicate);

            if (found.length > 0) {
              clearInterval(interval);
              resolve(found);
            } else if (Date.now() - start > LOG_RECORD_TIMEOUT_MS) {
              clearInterval(interval);
              // Rejecting rather than throwing from the timer, which would leave
              // this promise pending until the whole test times out.
              reject(
                new Error(
                  `Expected a log record matching ${description} within ${LOG_RECORD_TIMEOUT_MS.toString()}ms, saw ${records.length.toString()} records`,
                ),
              );
            }
          }, 100);
        });

        // Asserted outside the timer for the same reason. Returning the first
        // match would hide a record the SDK emitted twice.
        expect(matches, `log records matching ${description}`).toHaveLength(1);

        return matches[0];
      });
    },
    { scope: 'test' },
  ],
  getLogRecords: [
    async ({ requests }, use) => {
      await use(() => requests.flatMap(logRecordsOf));
    },
    { scope: 'test' },
  ],
  waitForRemoteConfigRequest: [
    async ({ waitForRequest }, use) => {
      await use(async () => {
        await waitForRequest(REMOTE_CONFIG_REGEX);
      });
    },
    { scope: 'test' },
  ],
  requests: [
    async ({ page }, use) => {
      const requests: EmbraceDataRequest[] = [];
      const handler = async (route: Route, request: Request) => {
        const buffer = route.request().postDataBuffer();

        if (!buffer) {
          console.warn('Invalid request from SDK');
          await route.fulfill({ status: 200, body: '0' });
          return;
        }

        // Record synchronously before route.continue() so the entry is in
        // `requests` by the time waitForOTelRequest sees it.
        try {
          const json = zlib.gunzipSync(buffer).toString('utf-8');
          requests.push({
            url: request.url(),
            headers: request.headers(),
            data: JSON.parse(json) as Record<string, unknown>,
          });
        } catch (e) {
          console.error('Failed to parse request from SDK:', e);
        }

        await route.continue();
      };

      await page.route(OTEL_REQUEST_REGEX, handler);
      await use(requests);
    },
    { scope: 'test' },
  ],
  withRemoteConfig: [
    async ({ page }, use) =>
      use(async (remoteConfig?: Record<string, unknown>) => {
        await page.route(REMOTE_CONFIG_REGEX, async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(remoteConfig || DEFAULT_REMOTE_CONFIG),
          });
        });
      }),
    { scope: 'test' },
  ],
  withSimulatedResponse: [
    async ({ page }, use) =>
      use(async (simulatedResponse: SimulatedResponse) => {
        await page.route(SIMULATED_REQUEST_REGEX, async (route) => {
          await route.fulfill(simulatedResponse);
        });
      }),
    { scope: 'test' },
  ],
  // Fakes visibility rather than actually hiding the tab, which Playwright
  // cannot do reliably.
  setPageVisibility: async ({ page }, use) => {
    await use(async (visibilityState) => {
      await page.evaluate((value) => {
        Object.defineProperty(document, 'visibilityState', {
          value,
          writable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }, visibilityState);
    });
  },
  getCurrentUserSessionId: async ({ page }, use) => {
    await use(async () => {
      const userSessionId = await page.evaluate(() =>
        window.EMBRACE_SDK.session.getUserSessionId(),
      );

      if (!userSessionId) {
        throw new Error('Session ID is not available on the page');
      }

      return userSessionId;
    });
  },
  validateThatSessionPartsEnded: async ({ getCurrentUserSessionId }, use) => {
    await use(async (expectedCount = 1, userSessionId?: string) => {
      const currentUserSessionId =
        userSessionId ?? (await getCurrentUserSessionId());

      const timeout = setTimeout(() => {
        throw new Error(
          `Expected ${expectedCount.toString()} session parts but timed out`,
        );
      }, 4000);

      await new Promise((resolve) => {
        const interval = setInterval(() => {
          void (async () => {
            const response = await fetch(
              'http://localhost:3001/received-spans',
            );
            const receivedSpans = (await response.json()) as ReceivedSpans;
            const parts = receivedSpans[currentUserSessionId];
            const count = parts ? Object.keys(parts).length : 0;

            if (count >= expectedCount) {
              clearInterval(interval);
              clearTimeout(timeout);
              resolve(null);
            }
          })();
        }, 200);
      });
    });
  },
});

const getAttributeValue = (
  attr: IKeyValue,
): string | number | boolean | null => {
  if (attr.value.stringValue !== undefined) {
    return attr.value.stringValue;
  }

  if (attr.value.intValue !== undefined) {
    return attr.value.intValue;
  }

  if (attr.value.boolValue !== undefined) {
    return attr.value.boolValue;
  }

  if (attr.value.doubleValue !== undefined) {
    return attr.value.doubleValue;
  }

  return null;
};

const isExcludedSpan = (entity: ISpan | ILogRecord): boolean => {
  if (!isSpan(entity)) {
    return false;
  }
  const urlAttr = entity.attributes?.find((attr) =>
    URL_ATTRIBUTE_KEYS.has(attr.key),
  );
  const url = urlAttr ? getAttributeValue(urlAttr) : null;
  return (
    typeof url === 'string' &&
    EXCLUDED_RESOURCE_URL_PATTERNS.some((pattern) => pattern.test(url))
  );
};

const isResourceSpan = (
  entity: IResourceSpans | IResourceLogs,
): entity is IResourceSpans =>
  (entity as IResourceSpans).scopeSpans !== undefined;

const isScopeSpan = (entity: IScopeSpans | IScopeLogs): entity is IScopeSpans =>
  (entity as IScopeSpans).spans !== undefined;

const isSpan = (entity: ISpan | ILogRecord): entity is ISpan =>
  (entity as ISpan).spanId !== undefined;

const getEntitySortKey = (entity: ISpan | ILogRecord): string => {
  if (isSpan(entity)) return entity.name;
  return (
    entity.attributes?.find((a) => a.key === 'browser.web_vital.name')?.value
      .stringValue ?? ''
  );
};

const expect = testWithMockApi.expect.extend({
  toMatchAttributes: (
    received: IKeyValue[],
    expected: IKeyValue[],
    { message = '' }: { message?: string } = {},
  ) => {
    const extraMessage = message ? `${message}\n` : '';

    // First check if they have the same length
    if (received.length !== expected.length) {
      const attributesDiff = diff(received, expected);

      return {
        pass: false,
        message: () =>
          `${extraMessage}Expected attributes to have the same length, but got\n ${attributesDiff || 'error getting diff'}`,
      };
    }

    // Sort copies by key so we don't mutate the caller's arrays
    const sortedReceived = [...received].sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    const sortedExpected = [...expected].sort((a, b) =>
      a.key.localeCompare(b.key),
    );

    // Compare each attribute
    for (const [index, receivedAttr] of sortedReceived.entries()) {
      const expectedAttr = sortedExpected[index];

      if (
        IGNORED_ATTRIBUTES_LIST.includes(receivedAttr.key) ||
        IGNORED_ATTRIBUTES_LIST.includes(expectedAttr.key)
      ) {
        if (receivedAttr.key !== expectedAttr.key) {
          return {
            pass: false,
            message: () =>
              `${extraMessage}Attribute key mismatch at index ${index.toString()}: expected key ${chalk.green(expectedAttr.key)}, but got ${chalk.red(receivedAttr.key)}`,
          };
        }
        continue;
      }

      const receivedValue = getAttributeValue(receivedAttr);
      const expectedValue = getAttributeValue(expectedAttr);

      // skip value comparison when both sides end with the same Nextjs filename
      if (
        URL_ATTRIBUTE_KEYS.has(receivedAttr.key) &&
        typeof receivedValue === 'string' &&
        typeof expectedValue === 'string' &&
        NEXTJS_URL_SUFFIX_REGEX.test(receivedValue) &&
        NEXTJS_URL_SUFFIX_REGEX.test(expectedValue)
      ) {
        continue;
      }

      if (
        receivedAttr.key !== expectedAttr.key ||
        receivedValue !== expectedValue
      ) {
        return {
          pass: false,
          message: () =>
            `${extraMessage}Attribute mismatch at index ${index.toString()}: expected ${expectedAttr.key} to be ${chalk.green(expectedValue)}, but got ${receivedAttr.key} with value ${chalk.red(receivedValue)}`,
        };
      }
    }

    return {
      pass: true,
      message: () => 'Attributes match',
    };
  },
  toMatchSpanEvents: (
    received: IEvent[],
    expected: IEvent[],
    { message = '' }: { message?: string } = {},
  ) => {
    const extraMessage = message ? `${message}\n` : '';

    try {
      // First check if they have the same length
      if (received.length !== expected.length) {
        return {
          pass: false,
          message: () =>
            `${extraMessage}Expected span events to have the same length, but got ${chalk.red(received.length)} and ${chalk.green(expected.length)}${INTENDED_CHANGE_MESSAGE}`,
        };
      }

      for (const [index, receivedEvent] of received.entries()) {
        const expectedEvent = expected[index];

        // Ignore fields that change on every run like timeUnixNano
        expect(receivedEvent).toEqual(
          expect.objectContaining({
            name: expectedEvent.name,
            droppedAttributesCount: expectedEvent.droppedAttributesCount,
          }),
        );

        expect(receivedEvent.attributes).toMatchAttributes(
          expectedEvent.attributes,
          {
            message: `${extraMessage}Attributes mismatch for span event ${receivedEvent.name}${INTENDED_CHANGE_MESSAGE}`,
          },
        );
      }

      return {
        pass: true,
        message: () => 'Spans events match',
      };
    } catch (e) {
      return {
        pass: false,
        message: () => (e as Error).message,
      };
    }
  },
  toMatchResource: (received: Resource, expected: Resource) => {
    expect({
      droppedAttributesCount: received.droppedAttributesCount,
    }).toEqual({
      droppedAttributesCount: expected.droppedAttributesCount,
    });

    expect(received.attributes).toMatchAttributes(expected.attributes, {
      message: `Attributes mismatch for resource`,
    });

    return {
      pass: true,
      message: () => 'Resources match',
    };
  },
  toMatchSpan: (received: ISpan, expected: ISpan) => {
    // Use this instead of objectContaining for a better error message
    expect({
      name: received.name,
      kind: received.kind,
      droppedAttributesCount: received.droppedAttributesCount,
      droppedEventsCount: received.droppedEventsCount,
      status: received.status,
      droppedLinksCount: received.droppedLinksCount,
    }).toEqual({
      name: expected.name,
      kind: expected.kind,
      droppedAttributesCount: expected.droppedAttributesCount,
      droppedEventsCount: expected.droppedEventsCount,
      status: expected.status,
      droppedLinksCount: expected.droppedLinksCount,
    });

    expect(received.attributes).toMatchAttributes(expected.attributes, {
      message: `Attributes mismatch for span ${received.name}`,
    });

    const sortedReceivedEvents = [...(received.events ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const sortedExpectedEvents = [...(expected.events ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    expect(sortedReceivedEvents).toMatchSpanEvents(sortedExpectedEvents, {
      message: `Events mismatch for span ${received.name}`,
    });

    // TODO: Add tests to links once we support them in the SDK

    return {
      pass: true,
      message: () => 'Spans match',
    };
  },
  toMatchLog: (received: ILogRecord, expected: ILogRecord) => {
    const ignoreBody =
      received.attributes?.some((a) => LOGS_WITH_IGNORED_BODY.has(a.key)) ??
      false;

    // Use this instead of objectContaining for a better error message
    expect({
      ...(ignoreBody ? {} : { body: received.body }),
      eventName: received.eventName,
      severityNumber: received.severityNumber,
      severityText: received.severityText,
      droppedAttributesCount: received.droppedAttributesCount,
    }).toEqual({
      ...(ignoreBody ? {} : { body: expected.body }),
      eventName: expected.eventName,
      severityNumber: expected.severityNumber,
      severityText: expected.severityText,
      droppedAttributesCount: expected.droppedAttributesCount,
    });

    expect(received.attributes).toMatchAttributes(expected.attributes, {
      message: `Attributes mismatch for log ${JSON.stringify(received.body)}`,
    });

    return {
      pass: true,
      message: () => 'Logs match',
    };
  },
  toMatchOTelEntities: (
    received: IResourceSpans[] | IResourceLogs[] | undefined,
    expected: IResourceSpans[] | IResourceLogs[] | undefined,
  ) => {
    if (!expected && !received) {
      return {
        pass: true,
        message: () => `Entities matched`,
      };
    }

    if (!expected || !received) {
      return {
        pass: false,
        message: () =>
          `Expected entities to be ${expected ? 'present' : 'absent'}, but received was ${received ? 'present' : 'absent'}${INTENDED_CHANGE_MESSAGE}`,
      };
    }

    if (expected && received) {
      if (expected.length !== received.length) {
        return {
          pass: false,
          message: () =>
            `Expected ${chalk.green(expected.length)} scope entities, but got ${chalk.red(received.length)}${INTENDED_CHANGE_MESSAGE}\n${
              diff(expected, received, {
                expand: true,
                aAnnotation: 'Expected',
                bAnnotation: 'Received',
              }) || ''
            }`,
        };
      }

      for (const [resourceIndex, receivedResource] of received.entries()) {
        const receivedEntities = isResourceSpan(receivedResource)
          ? receivedResource.scopeSpans
          : receivedResource.scopeLogs;
        const expectedEntities = isResourceSpan(expected[resourceIndex])
          ? expected[resourceIndex].scopeSpans
          : expected[resourceIndex].scopeLogs;

        if (receivedResource.resource && expected[resourceIndex].resource) {
          try {
            expect(receivedResource.resource).toMatchResource(
              expected[resourceIndex].resource,
            );
          } catch (e) {
            return {
              pass: false,
              message: () =>
                `Resource in scope ${resourceIndex.toString()} does not match:\n${(e as Error).message}${INTENDED_CHANGE_MESSAGE}`,
            };
          }
        }

        for (const [scopeIndex, receivedScope] of receivedEntities.entries()) {
          const receivedScopes = isScopeSpan(receivedScope)
            ? receivedScope.spans
            : receivedScope.logRecords;
          const expectedScopes = isScopeSpan(expectedEntities[scopeIndex])
            ? expectedEntities[scopeIndex].spans
            : expectedEntities[scopeIndex].logRecords;

          if (receivedScope.scope) {
            if (receivedScopes && expectedScopes) {
              const filteredReceived = receivedScopes.filter(
                (e) => !isExcludedSpan(e),
              );
              const filteredExpected = expectedScopes.filter(
                (e) => !isExcludedSpan(e),
              );

              if (filteredReceived.length !== filteredExpected.length) {
                return {
                  pass: false,
                  message: () =>
                    `Expected ${chalk.green(filteredExpected.length)} entities in scope ${resourceIndex.toString()}, but got ${chalk.red(filteredReceived.length)}${INTENDED_CHANGE_MESSAGE}\n${
                      diff(filteredExpected, filteredReceived, {
                        expand: true,
                        aAnnotation: 'Expected',
                        bAnnotation: 'Received',
                      }) || ''
                    }`,
                };
              }

              // For some instrumentation is not possible to compare spans/logs by name and attributes
              // as spans/logs are created in different orders and there's no way of matching them with the previous results
              if (
                INSTRUMENTATION_WITH_SIMPLIFIED_COMPARISON.includes(
                  receivedScope.scope.name,
                )
              ) {
                continue;
              }

              const shouldSort = SCOPES_WITH_SORTED_COMPARISON.has(
                receivedScope.scope.name,
              );
              const sortedReceived = shouldSort
                ? [...filteredReceived].sort((a, b) =>
                    getEntitySortKey(a).localeCompare(getEntitySortKey(b)),
                  )
                : filteredReceived;
              const sortedExpected = shouldSort
                ? [...filteredExpected].sort((a, b) =>
                    getEntitySortKey(a).localeCompare(getEntitySortKey(b)),
                  )
                : filteredExpected;

              for (const [
                entityIndex,
                receivedEntity,
              ] of sortedReceived.entries()) {
                const expectedEntity = sortedExpected[entityIndex];

                try {
                  if (isSpan(receivedEntity) && isSpan(expectedEntity)) {
                    expect(receivedEntity).toMatchSpan(expectedEntity);
                  } else if (
                    !isSpan(receivedEntity) &&
                    !isSpan(expectedEntity)
                  ) {
                    expect(receivedEntity).toMatchLog(expectedEntity);
                  } else {
                    throw new Error(
                      `Entity type mismatch: received is ${isSpan(receivedEntity) ? 'a span' : 'a log'} but expected is ${isSpan(expectedEntity) ? 'a span' : 'a log'}`,
                    );
                  }
                } catch (e) {
                  const entityName = isSpan(receivedEntity)
                    ? receivedEntity.name
                    : receivedEntity.body?.stringValue || '';

                  return {
                    pass: false,
                    message: () =>
                      `Entity ${entityName} in scope ${resourceIndex.toString()} does not match:\n${(e as Error).message}${INTENDED_CHANGE_MESSAGE}`,
                  };
                }
              }
            }
          }
        }
      }
    }

    return {
      pass: true,
      message: () => `Entities matched`,
    };
  },
  // A record's content is fixed the moment it is emitted, so it can be
  // snapshotted where the request carrying it cannot.
  toMatchGoldenLogRecord: (received: ILogRecord, fileName: string) => {
    if (!fs.existsSync(GOLDEN_DIR)) {
      fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    }

    const filePath = path.join(GOLDEN_DIR, fileName);
    const actualString = JSON.stringify(received, null, 2);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, actualString);

      return {
        pass: true,
        message: () => `Golden file created: ${filePath}`,
      };
    }

    try {
      expect(received).toMatchLog(
        JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ILogRecord,
      );
    } catch (e) {
      if (shouldUpdateGolden) {
        fs.writeFileSync(filePath, actualString);

        return {
          pass: true,
          message: () => `Golden file updated: ${filePath}`,
        };
      } else {
        throw new Error(`${(e as Error).message}${INTENDED_CHANGE_MESSAGE}`);
      }
    }

    return {
      pass: true,
      message: () => `Golden file matched: ${fileName}`,
    };
  },
  toMatchGoldenFile: (received: EmbraceDataRequest, fileName: string) => {
    if (!fs.existsSync(GOLDEN_DIR)) {
      fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    }

    const filePath = path.join(GOLDEN_DIR, fileName);
    const actualString = JSON.stringify(received.data, null, 2);

    if (!fs.existsSync(filePath)) {
      // First run: write the golden file
      fs.writeFileSync(filePath, actualString);

      return {
        pass: true,
        message: () => `Golden file created: ${filePath}`,
      };
    }

    const expectedString = fs.readFileSync(filePath, 'utf-8');

    try {
      const expectedResources = received.data['resourceSpans']
        ? (JSON.parse(expectedString) as IExportTraceServiceRequest)
            .resourceSpans
        : (JSON.parse(expectedString) as IExportLogsServiceRequest)
            .resourceLogs;
      const receivedResources = received.data['resourceSpans']
        ? (received.data as IExportTraceServiceRequest).resourceSpans
        : (received.data as IExportLogsServiceRequest).resourceLogs;

      expect(receivedResources).toMatchOTelEntities(expectedResources);
    } catch (e) {
      // If we are updating the golden file, and the comparison fails for any reason,
      // we will write the actual data to the golden file
      if (shouldUpdateGolden) {
        fs.writeFileSync(filePath, actualString);

        return {
          pass: true,
          message: () => `Golden file updated: ${filePath}`,
        };
      } else {
        throw e;
      }
    }

    return {
      pass: true,
      message: () => `Golden file matched: ${fileName}`,
    };
  },
});

export default testWithMockApi;
export { expect };
