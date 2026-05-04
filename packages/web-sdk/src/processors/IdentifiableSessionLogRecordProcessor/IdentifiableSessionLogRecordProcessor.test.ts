import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import { setupTestLogExporter } from '../../../tests/utils/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceUserSessionManager,
} from '../../managers/index.ts';
import { IdentifiableSessionLogRecordProcessor } from './IdentifiableSessionLogRecordProcessor.ts';

const { expect } = chai;

describe('IdentifiableSessionLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let userSessionManager: EmbraceUserSessionManager;
  let logger: Logger;

  beforeEach(() => {
    userSessionManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionLogRecordProcessor({
        userSessionManager,
      }),
    ]);
    logger = logs.getLogger('test-logger');
  });

  afterEach(() => {
    logs.disable();
  });

  it('should attach a log UUID and session part ID when available', () => {
    userSessionManager.startSessionPart();
    const sessionID = userSessionManager.getSessionPartId();

    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['log.record.uid']).to.have.lengthOf(32);
    expect(log.attributes['emb.session_part_id']).to.be.equal(sessionID);
  });

  it('should stamp an empty session part ID when none is active', () => {
    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['log.record.uid']).to.have.lengthOf(32);
    expect(log.attributes['emb.session_part_id']).to.equal('');
  });

  it('should only tag the active session part ID, never the previous one', () => {
    userSessionManager.startSessionPart();
    userSessionManager.startSessionPart();
    const currentPartID = userSessionManager.getSessionPartId();

    logger.emit({
      body: 'some log',
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const log = finishedLogs[0];

    expect(log.attributes['emb.session_part_id']).to.be.equal(currentPartID);
  });
});
