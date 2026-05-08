import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import { setupTestLogExporter } from '../../../tests/utils/index.ts';
import { NoOpSpanSessionManager } from '../../api-sessions/manager/NoOpSpanSessionManager/index.ts';
import type { SpanSessionManagerInternal } from '../../managers/EmbraceSpanSessionManager/index.ts';
import type { UserSessionAttributes } from '../../managers/EmbraceSpanSessionManager/types.ts';
import { IdentifiableSessionLogRecordProcessor } from './IdentifiableSessionLogRecordProcessor.ts';

const { expect } = chai;

const mockAttributes: UserSessionAttributes = {
  'session.id': 'USER_SESSION_ABC',
  'emb.user_session_id': 'USER_SESSION_ABC',
  'emb.user_session_number': 1,
  'emb.user_session_part_number': 3,
  'emb.user_session_start_ts': 1000,
  'emb.user_session_max_duration_seconds': 43200,
  'emb.user_session_inactivity_timeout_seconds': 1800,
};

// Stub built on top of NoOpSpanSessionManager so we satisfy the full
// SpanSessionManagerInternal surface without listing every method. A non-null
// `attrs` models an active user session, which implies an active part; a null
// `attrs` models neither.
const createMockSpanSessionManager = (
  attrs: UserSessionAttributes | null = mockAttributes,
  overrides: Partial<SpanSessionManagerInternal> = {},
): SpanSessionManagerInternal => {
  const base = new NoOpSpanSessionManager();
  return Object.assign(base, {
    getUserSessionId: () => (attrs ? attrs['emb.user_session_id'] : null),
    getSessionPartId: () => (attrs ? 'PART_XYZ' : null),
    getUserSessionAttributes: () => attrs,
    ...overrides,
  });
};

const setup = (manager: SpanSessionManagerInternal) => {
  const memoryExporter = setupTestLogExporter([
    new IdentifiableSessionLogRecordProcessor({ spanSessionManager: manager }),
  ]);
  const logger = logs.getLogger('test-logger');
  return { memoryExporter, logger };
};

describe('IdentifiableSessionLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let logger: Logger;

  afterEach(() => {
    logs.disable();
  });

  it('should stamp a 32-char log uid and the active part id on every record', () => {
    ({ memoryExporter, logger } = setup(createMockSpanSessionManager()));

    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    expect(logRecord.attributes['log.record.uid']).to.have.lengthOf(32);
    expect(logRecord.attributes['emb.session_part_id']).to.equal('PART_XYZ');
  });

  it('should stamp an empty part id and empty session ids when no part is active (spec 2.1)', () => {
    ({ memoryExporter, logger } = setup(createMockSpanSessionManager(null)));

    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    expect(logRecord.attributes['log.record.uid']).to.have.lengthOf(32);
    expect(logRecord.attributes['emb.session_part_id']).to.equal('');
    expect(logRecord.attributes['session.id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal('');
  });

  it('should stamp the 3 session ids on logs emitted during an active part', () => {
    ({ memoryExporter, logger } = setup(createMockSpanSessionManager()));

    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    expect(logRecord.attributes['session.id']).to.equal('USER_SESSION_ABC');
    expect(logRecord.attributes['emb.user_session_id']).to.equal(
      'USER_SESSION_ABC',
    );
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal('');

    // Session-part-only keys must not appear on logs.
    void expect(logRecord.attributes['emb.user_session_number']).to.be
      .undefined;
    void expect(logRecord.attributes['emb.user_session_part_number']).to.be
      .undefined;
    void expect(logRecord.attributes['emb.user_session_start_ts']).to.be
      .undefined;
    void expect(logRecord.attributes['emb.user_session_max_duration_seconds'])
      .to.be.undefined;
    void expect(
      logRecord.attributes['emb.user_session_inactivity_timeout_seconds'],
    ).to.be.undefined;
  });

  it('should still stamp session.id from setSessionId() override even with no part id', () => {
    ({ memoryExporter, logger } = setup(
      createMockSpanSessionManager(null, {
        getUserSessionIdOverride: () => 'customer-id',
      }),
    ));

    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    // Customer override is customer-owned; honored regardless of part state.
    expect(logRecord.attributes['session.id']).to.equal('customer-id');
    expect(logRecord.attributes['emb.user_session_id']).to.equal('');
    // Spec 2.1: with no active part the part id is empty even when an
    // override is in play.
    expect(logRecord.attributes['emb.session_part_id']).to.equal('');
  });

  it('should emit the previous user session id on emb.user_session_previous_id when available', () => {
    ({ memoryExporter, logger } = setup(
      createMockSpanSessionManager(mockAttributes, {
        getPreviousUserSessionId: () => 'PREVIOUS_USER_SESSION',
      }),
    ));

    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal(
      'PREVIOUS_USER_SESSION',
    );
  });

  it('should leave a user-set session.id untouched when no user session is active', () => {
    ({ memoryExporter, logger } = setup(createMockSpanSessionManager(null)));

    logger.emit({
      body: 'test log',
      attributes: { 'session.id': 'user-override' },
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    expect(logRecord.attributes['session.id']).to.equal('user-override');
    expect(logRecord.attributes['emb.user_session_id']).to.equal('');
  });

  it('should preserve a user-set session.id and still apply emb.user_session_id', () => {
    ({ memoryExporter, logger } = setup(createMockSpanSessionManager()));

    logger.emit({
      body: 'test log',
      attributes: { 'session.id': 'user-override' },
    });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    expect(logRecord.attributes['session.id']).to.equal('user-override');
    expect(logRecord.attributes['emb.user_session_id']).to.equal(
      'USER_SESSION_ABC',
    );
  });

  it('should swallow exceptions from the user session manager and stamp empty-string ids', () => {
    const throwingManager = createMockSpanSessionManager(mockAttributes, {
      getUserSessionId: () => {
        throw new Error('boom');
      },
    });
    ({ memoryExporter, logger } = setup(throwingManager));

    expect(() => logger.emit({ body: 'test log' })).to.not.throw();

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    // Four-attribute contract holds even on failure.
    expect(logRecord.attributes['emb.session_part_id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal('');
    expect(logRecord.attributes['session.id']).to.equal('');
  });
});
