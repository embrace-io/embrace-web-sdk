import * as chai from 'chai';
import { EmbTypeLogRecordProcessor } from './EmbTypeLogRecordProcessor.js';
import { setupTestLogExporter } from '../../testUtils/index.js';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';

const { expect } = chai;

describe('EmbTypeLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let logger: Logger;

  before(() => {
    memoryExporter = setupTestLogExporter([new EmbTypeLogRecordProcessor()]);
    logger = logs.getLogger('test-logger');
  });

  afterEach(() => {
    memoryExporter.reset();
  });

  it('should attach the proper emb.type to emitted logs', () => {
    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];
    expect(log.attributes['emb.type']).to.be.equal('sys.log');
  });
});
