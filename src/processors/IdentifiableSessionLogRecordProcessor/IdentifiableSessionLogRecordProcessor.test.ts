import * as chai from 'chai';
import { IdentifiableSessionLogRecordProcessor } from './IdentifiableSessionLogRecordProcessor.js';
import { setupTestLogExporter } from '../../testUtils/index.js';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import type { SpanSessionManager } from '../../api-sessions/index.js';
import { EmbraceSpanSessionManager } from '../../instrumentations/index.js';
import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';

const { expect } = chai;

describe('IdentifiableSessionLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let spanSessionManager: SpanSessionManager;
  let logger: Logger;

  before(() => {
    spanSessionManager = new EmbraceSpanSessionManager();
    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionLogRecordProcessor({
        spanSessionManager,
      }),
    ]);
    logger = logs.getLogger('test-logger');
  });

  afterEach(() => {
    spanSessionManager.endSessionSpan();
    memoryExporter.reset();
  });

  it('should attach a log UUID and session ID when available', () => {
    spanSessionManager.startSessionSpan();
    const sessionID = spanSessionManager.getSessionId();

    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['log.record.uid']).to.have.lengthOf(32);
    expect(log.attributes['session.id']).to.be.equal(sessionID);
  });

  it('should handle a session ID not being available', () => {
    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['log.record.uid']).to.have.lengthOf(32);
    void expect(log.attributes['session.id']).to.be.undefined;
  });
});
