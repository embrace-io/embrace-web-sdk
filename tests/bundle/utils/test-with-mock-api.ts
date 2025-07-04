import { test as base } from '@playwright/test';
import { EMBRACE_API_REGEX } from '../constants/index.js';
import zlib from 'node:zlib';
import path, { dirname } from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import {
  IExportLogsServiceRequest,
  ILogRecord,
  IResourceLogs,
  IScopeLogs,
} from '@opentelemetry/otlp-transformer/build/esnext/logs/internal-types';
import {
  IEvent,
  IExportTraceServiceRequest,
  IResourceSpans,
  IScopeSpans,
  ISpan,
} from '@opentelemetry/otlp-transformer/build/esnext/trace/internal-types';
import { IKeyValue, IResource } from '@opentelemetry/otlp-transformer';
import { Route, Request } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GOLDEN_DIR = path.resolve(__dirname, '../tests/__golden__');
const INTENDED_CHANGE_MESSAGE = `\n\nIf you intended to change the golden files, run test:e2e:update-golden instead.`;
const shouldUpdateGolden = process.env.UPDATE_GOLDEN === '1';

type EmbraceDataRequest = {
  url: string;
  headers: Record<string, string>;
  data: Record<string, unknown>;
};

type TestWithMockApi = {
  requests: EmbraceDataRequest[];
  waitForRequest: () => Promise<void>;
};

// Instrumentation on this list will only compare that the same amount of spans
// are created, but not their attributes, since there's no way of ordering them properly to match the previous results.
const INSTRUMENTATION_WITH_SIMPLIFIED_COMPARISON = [
  '@opentelemetry/instrumentation-document-load',
];
const IGNORED_ATTRIBUTES_LIST = ['session.id', 'log.record.uid'];

const testWithMockApi = base.extend<TestWithMockApi>({
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
                data: JSON.parse(json),
              });
            } catch (e) {
              console.error('Failed to parse request to JSON:', e);
            }
          }
        });

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'ok' }),
        });
      };

      await page.route(EMBRACE_API_REGEX, handler);
      await use(requests);
      await page.unroute(EMBRACE_API_REGEX, handler);
    },
    { scope: 'test' },
  ],
  waitForRequest: [
    async ({ page }, use) => {
      await use(async () => {
        await page.waitForResponse(
          request => request.url().match(EMBRACE_API_REGEX) !== null
        );
      });
    },
    { scope: 'test' },
  ],
});

const getAttributeValue = (
  attr: IKeyValue
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

const isResourceSpan = (
  entity: IResourceSpans | IResourceLogs
): entity is IResourceSpans => {
  return (entity as IResourceSpans).scopeSpans !== undefined;
};

const isScopeSpan = (
  entity: IScopeSpans | IScopeLogs
): entity is IScopeSpans => {
  return (entity as IScopeSpans).spans !== undefined;
};

const isSpan = (entity: ISpan | ILogRecord): entity is ISpan => {
  return (entity as ISpan).spanId !== undefined;
};

const expect = testWithMockApi.expect.extend({
  toMatchAttributes: (
    received: IKeyValue[],
    expected: IKeyValue[],
    { message = '' }: { message?: string } = {}
  ) => {
    const extraMessage = message ? `${message}\n` : '';

    // First check if they have the same length
    if (received.length !== expected.length) {
      return {
        pass: false,
        message: () =>
          `${extraMessage}Expected attributes to have the same length, but got ${chalk.red(received.length)} and ${chalk.green(expected.length)}${INTENDED_CHANGE_MESSAGE}`,
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

      if (
        receivedAttr.key !== expectedAttr.key ||
        receivedValue !== expectedValue
      ) {
        return {
          pass: false,
          message: () =>
            `${extraMessage}Attribute mismatch at index ${index}: expected ${expectedAttr.key} to be ${chalk.green(expectedValue)}, but got ${receivedAttr.key} with value ${chalk.red(receivedValue)}${INTENDED_CHANGE_MESSAGE}`,
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
    { message = '' }: { message?: string } = {}
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
          })
        );

        expect(receivedEvent.attributes).toMatchAttributes(
          expectedEvent.attributes,
          {
            message: `${extraMessage}Attributes mismatch for span event ${receivedEvent.name}${INTENDED_CHANGE_MESSAGE}`,
          }
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
  toMatchSpan: (received: ISpan, expected: ISpan) => {
    expect(received).toEqual(
      // Ignore fields that change on every run like traceId, spanId, etc.
      expect.objectContaining({
        name: expected.name,
        kind: expected.kind,
        droppedAttributesCount: expected.droppedAttributesCount,
        droppedEventsCount: expected.droppedEventsCount,
        status: expected.status,
        droppedLinksCount: expected.droppedLinksCount,
      })
    );

    expect(received.attributes).toMatchAttributes(expected.attributes, {
      message: `Attributes mismatch for span ${received.name}`,
    });

    expect(received.events).toMatchSpanEvents(expected.events, {
      message: `Events mismatch for span ${received.name}`,
    });

    // TODO: Add tests to links once we support them in the SDK

    return {
      pass: true,
      message: () => 'Spans match',
    };
  },
  toMatchLog: (received: ILogRecord, expected: ILogRecord) => {
    expect(received).toEqual(
      // Ignore fields that change on every run like timeUnixNano, etc.
      expect.objectContaining({
        body: expected.body,
        severityNumber: expected.severityNumber,
        severityText: expected.severityText,
        droppedAttributesCount: expected.droppedAttributesCount,
      })
    );

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
    expected: IResourceSpans[] | IResourceLogs[] | undefined
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
            `Expected ${chalk.green(expected.length)} scope entities, but got ${chalk.red(received.length)}${INTENDED_CHANGE_MESSAGE}`,
        };
      }

      for (const [resourceIndex, receivedResource] of received.entries()) {
        const receivedEntities = isResourceSpan(receivedResource)
          ? receivedResource.scopeSpans
          : receivedResource.scopeLogs;
        const expectedEntities = isResourceSpan(expected[resourceIndex])
          ? expected[resourceIndex].scopeSpans
          : expected[resourceIndex].scopeLogs;

        for (const [scopeIndex, receivedScope] of receivedEntities.entries()) {
          const receivedScopes = isScopeSpan(receivedScope)
            ? receivedScope.spans
            : receivedScope.logRecords;
          const expectedScopes = isScopeSpan(expectedEntities[scopeIndex])
            ? expectedEntities[scopeIndex].spans
            : expectedEntities[scopeIndex].logRecords;

          if (receivedScope.scope) {
            // For some instrumentation is not possible to compare spans/logs by name and attributes
            // as spans/logs are created in different orders and there's no way of matching them with the previous results
            if (
              INSTRUMENTATION_WITH_SIMPLIFIED_COMPARISON.includes(
                receivedScope.scope.name
              )
            ) {
              continue;
            }

            if (receivedScopes && expectedScopes) {
              if (receivedScopes.length !== expectedScopes.length) {
                return {
                  pass: false,
                  message: () =>
                    `Expected ${chalk.green(expectedScopes.length)} entities in scope ${resourceIndex}, but got ${chalk.red(receivedScopes.length)}${INTENDED_CHANGE_MESSAGE}`,
                };
              }

              for (const [
                entityIndex,
                receivedEntity,
              ] of receivedScopes.entries()) {
                const expectedEntity = expectedScopes[entityIndex];

                if (receivedEntity && expectedEntity) {
                  if (isSpan(receivedEntity) && isSpan(expectedEntity)) {
                    expect(receivedEntity).toMatchSpan(expectedEntity);
                  } else if (
                    !isSpan(receivedEntity) &&
                    !isSpan(expectedEntity)
                  ) {
                    expect(receivedEntity).toMatchLog(expectedEntity);
                  }
                } else {
                  return {
                    pass: false,
                    message: () =>
                      `Expected entity at index ${entityIndex} in scope ${resourceIndex} to match${INTENDED_CHANGE_MESSAGE}`,
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
      const expectedResources =
        received.data && received.data.resourceSpans
          ? (JSON.parse(expectedString) as IExportTraceServiceRequest)
              .resourceSpans
          : (JSON.parse(expectedString) as IExportLogsServiceRequest)
              .resourceLogs;
      const receivedResources =
        received.data && received.data.resourceSpans
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
