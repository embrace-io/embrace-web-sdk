import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import { setupTestLogExporter } from '../../../tests/utils/index.ts';
import type { SpanSessionManager } from '../../api-sessions/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSpanSessionManager,
} from '../../managers/index.ts';
import { IdentifiableSessionLogRecordProcessor } from './IdentifiableSessionLogRecordProcessor.ts';

const { expect } = chai;

describe('IdentifiableSessionLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let spanSessionManager: SpanSessionManager;
  let logger: Logger;

  beforeEach(() => {
    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionLogRecordProcessor({
        spanSessionManager,
      }),
    ]);
    logger = logs.getLogger('test-logger');
  });

  afterEach(() => {
    logs.disable();
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
    void expect(log.attributes['session.previous_id']).to.be.null;
  });

  it('should handle a session ID not being available', () => {
    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['log.record.uid']).to.have.lengthOf(32);
    void expect(log.attributes['session.id']).to.be.null;
    void expect(log.attributes['session.previous_id']).to.be.null;
  });

  it('should attach a previous session ID when available', () => {
    spanSessionManager.startSessionSpan();
    const sessionID = spanSessionManager.getSessionId();
    spanSessionManager.endSessionSpan();

    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['log.record.uid']).to.have.lengthOf(32);
    void expect(log.attributes['session.id']).to.be.null;
    expect(log.attributes['session.previous_id']).to.be.equal(sessionID);
  });

  it('should attach a session ID and a previous session ID when both are available', () => {
    spanSessionManager.startSessionSpan();
    const session1ID = spanSessionManager.getSessionId();
    spanSessionManager.startSessionSpan();
    const session2ID = spanSessionManager.getSessionId();

    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['log.record.uid']).to.have.lengthOf(32);
    expect(log.attributes['session.id']).to.be.equal(session2ID);
    expect(log.attributes['session.previous_id']).to.be.equal(session1ID);
  });
});
