import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import { setupTestLogExporter } from '../../../tests/utils/index.ts';
import type { SessionPartManager } from '../../api-sessions/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceSessionPartManager,
} from '../../managers/index.ts';
import { IdentifiableSessionPartLogRecordProcessor } from './IdentifiableSessionPartLogRecordProcessor.ts';

const { expect } = chai;

describe('IdentifiableSessionPartLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let sessionPartManager: SessionPartManager;
  let logger: Logger;

  beforeEach(() => {
    sessionPartManager = new EmbraceSessionPartManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionPartLogRecordProcessor({
        sessionPartManager,
      }),
    ]);
    logger = logs.getLogger('test-logger');
  });

  afterEach(() => {
    logs.disable();
  });

  it('should attach a log UUID and session part ID when available', () => {
    sessionPartManager.startSessionPart();
    const sessionID = sessionPartManager.getSessionPartId();

    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['log.record.uid']).to.have.lengthOf(32);
    expect(log.attributes['emb.session_part_id']).to.be.equal(sessionID);
  });

  it('should handle a session part ID not being available', () => {
    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['log.record.uid']).to.have.lengthOf(32);
    // Spec §2.1: events without a part id must not have a session id; the
    // processor therefore leaves `emb.session_part_id` unset (not empty string).
    void expect(log.attributes).to.not.have.property('emb.session_part_id');
  });

  it('should only tag the active session part ID, never the previous one', () => {
    sessionPartManager.startSessionPart();
    sessionPartManager.startSessionPart();
    const currentPartID = sessionPartManager.getSessionPartId();

    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['emb.session_part_id']).to.be.equal(currentPartID);
  });
});
