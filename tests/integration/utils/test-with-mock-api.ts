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

const __dirname = dirname(fileURLToPath(import.meta.url));

const GOLDEN_DIR = path.resolve(__dirname, '../tests/__golden__');
const INTENDED_CHANGE_MESSAGE = `\n\nIf you intended to change the golden files, run test:integration:update-golden instead.`;
const shouldUpdateGolden = process.env.UPDATE_GOLDEN === '1';
const DEFAULT_REMOTE_CONFIG: Record<string, unknown> = {
  threshold: 100, // Default to 100% for tests
};
const OTEL_REQUEST_REGEX = /http:\/\/localhost:3001\/v2\/(spans|logs)$/;
const REMOTE_CONFIG_REGEX = /^https?:\/\/.*\/v2\/config\?.*/;
const SIMULATED_REQUEST_REGEX = /simulated/;
// Next.js build hashes make the full path non-deterministic for internal manifest fetches,
// so skip exact comparison when both URLs end with the same filename
const URL_ATTRIBUTE_KEYS = new Set(['http.url', 'url.full']);
const NEXTJS_URL_SUFFIX_REGEX = /\/_clientMiddlewareManifest\.json$/;

type EmbraceDataRequest = {
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
  waitForOTelRequest: () => Promise<void>;
  waitForRemoteConfigRequest: () => Promise<void>;
  withRemoteConfig: (remoteConfig?: Record<string, unknown>) => Promise<void>;
  withSimulatedResponse: (response: SimulatedResponse) => Promise<void>;
};

// Instrumentation on this list will only compare that the same amount of spans
// are created, but not their attributes, since there's no way of ordering them properly to match the previous results.
const INSTRUMENTATION_WITH_SIMPLIFIED_COMPARISON = [
  'DocumentLoadInstrumentation',
];
// Resource spans whose url.full matches any of these patterns are excluded from
// comparison entirely. Favicons are fetched asynchronously by the browser and
// may or may not complete before the SDK captures PerformanceResourceTiming
// entries, making their presence in a session non-deterministic.
const EXCLUDED_RESOURCE_URL_PATTERNS = [/favicon\.ico$/];
const IGNORED_ATTRIBUTES_LIST = [
  'session.id',
  'log.record.uid',
  'emb.sdk_startup_duration',
  'emb.app_instance_id',
  // CI runs on Linux, devs might use different OS, thus different user agent
  'user_agent.original',
  'emb.stacktrace.js',
  'emb.js_file_bundle_ids',
  'emb.tab_id',
  'emb.parent_tab_id',
  'emb.experience_id',
  'emb.web_vital.attribution.elementRenderDelay',
  'emb.web_vital.attribution.timeToFirstByte',
  'emb.web_vital.delta',
  'emb.web_vital.id',
  'emb.web_vital.value',
  'tap.coords',
];

const testWithMockApi = base.extend<TestWithMockApi>({
  waitForRequest: [
    async ({ page, requests }, use) => {
      await use(async (url) => {
        await Promise.any([
          // Wait for the request to be made or
          page.waitForResponse((request) => request.url().match(url) !== null),
          // Check if the request has already been made
          new Promise((resolve) => {
            if (requests.length > 0 && requests.find((r) => r.url.match(url))) {
              resolve(undefined);
            }
          }),
        ]);
      });
    },
    { scope: 'test' },
  ],
  waitForOTelRequest: [
    async ({ waitForRequest }, use) => {
      await use(async () => {
        await waitForRequest(OTEL_REQUEST_REGEX);
      });
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

        // Decompress the gzipped data
        zlib.gunzip(buffer, (err, result) => {
          if (err) {
            console.error('Failed to decompress request from SDK:', err);
          } else {
            try {
              const json = result.toString('utf-8');

              requests.push({
                url: request.url(),
                headers: request.headers(),
                data: JSON.parse(json) as Record<string, unknown>,
              });
            } catch (e) {
              console.error('Failed to parse request to JSON:', e);
            }
          }
        });

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

    // Sort both arrays by key
    const sortedReceived = received.sort((a, b) => a.key.localeCompare(b.key));
    const sortedExpected = expected.sort((a, b) => a.key.localeCompare(b.key));

    // Compare each attribute
    for (const [index, receivedAttr] of sortedReceived.entries()) {
      if (IGNORED_ATTRIBUTES_LIST.includes(receivedAttr.key)) {
        // If the attribute is in the ignored list, skip it
        continue;
      }

      const expectedAttr = sortedExpected[index];

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

    const sortedReceivedEvents = received.events.sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const sortedExpectedEvents = expected.events.sort((a, b) =>
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
    // Use this instead of objectContaining for a better error message
    expect({
      body: received.body,
      severityNumber: received.severityNumber,
      severityText: received.severityText,
      droppedAttributesCount: received.droppedAttributesCount,
    }).toEqual({
      body: expected.body,
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
                      diff(filteredReceived, filteredExpected, {
                        expand: true,
                        aAnnotation: 'Received',
                        bAnnotation: 'Expected',
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

              for (const [
                entityIndex,
                receivedEntity,
              ] of filteredReceived.entries()) {
                const expectedEntity = filteredExpected[entityIndex];

                try {
                  if (isSpan(receivedEntity) && isSpan(expectedEntity)) {
                    expect(receivedEntity).toMatchSpan(expectedEntity);
                  } else if (
                    !isSpan(receivedEntity) &&
                    !isSpan(expectedEntity)
                  ) {
                    expect(receivedEntity).toMatchLog(expectedEntity);
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
      const expectedResources = received.data.resourceSpans
        ? (JSON.parse(expectedString) as IExportTraceServiceRequest)
            .resourceSpans
        : (JSON.parse(expectedString) as IExportLogsServiceRequest)
            .resourceLogs;
      const receivedResources = received.data.resourceSpans
        ? (received.data as IExportTraceServiceRequest).resourceSpans
        : (received.data as IExportLogsServiceRequest).resourceLogs;

      expect(expectedResources).toMatchOTelEntities(receivedResources);
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
