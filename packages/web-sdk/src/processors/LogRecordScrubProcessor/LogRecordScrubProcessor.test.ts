import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import { setupTestLogExporter } from '../../../tests/utils/index.ts';
import { LogRecordScrubProcessor } from './LogRecordScrubProcessor.ts';

const { expect } = chai;

describe('LogRecordScrubProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let logger: Logger;

  before(() => {
    const attributeScrubbers = [
      { key: 'my-attr1', scrub: (_value: string) => 'SCRUBBED!' },
      { key: 'my-attr2', scrub: (_value: string) => '*****' },
    ];

    memoryExporter = setupTestLogExporter([
      new LogRecordScrubProcessor({ attributeScrubbers }),
    ]);
    logger = logs.getLogger('test-logger');
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  it('should apply the scrubbers to the relevant attributes on emitted logs', () => {
    logger.emit({
      body: 'first log',
      attributes: {
        'my-attr1': 'value1',
        'my-attr2': 'value2',
        'my-attr3': 'value3',
      },
    });
    logger.emit({
      body: 'second log',
      attributes: {
        'my-attr1': 1,
        'my-attr2': true,
        'my-attr3': 'value3',
      },
    });
    logger.emit({
      body: 'third log',
      attributes: {
        'my-attr3': 'value3',
      },
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();

    expect(finishedLogs).to.have.lengthOf(3);

    // Scrubbing applied
    expect(finishedLogs[0]!.attributes).to.deep.equal({
      'my-attr1': 'SCRUBBED!',
      'my-attr2': '*****',
      'my-attr3': 'value3',
    });

    // Non-string attributes are ignored
    expect(finishedLogs[1]!.attributes).to.deep.equal({
      'my-attr1': 1,
      'my-attr2': true,
      'my-attr3': 'value3',
    });

    // No relevant attributes to scrub
    expect(finishedLogs[2]!.attributes).to.deep.equal({
      'my-attr3': 'value3',
    });
  });
});
