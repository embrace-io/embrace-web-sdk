import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import { setupTestLogExporter } from '../../../tests/utils/index.ts';
import { NoOpUserSessionManager } from '../../api-sessions/manager/NoOpUserSessionManager/index.ts';
import type { UserSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/index.ts';
import type { UserSessionAttributes } from '../../managers/EmbraceUserSessionManager/types.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbraceUserSessionManager,
} from '../../managers/index.ts';
import { IdentifiableSessionLogRecordProcessor } from '../IdentifiableSessionLogRecordProcessor/IdentifiableSessionLogRecordProcessor.ts';
import { UserSessionLogRecordProcessor } from './UserSessionLogRecordProcessor.ts';

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

// Stub built on top of NoOpUserSessionManager so we satisfy the full
// UserSessionManagerInternal surface without listing every method. The
// processor only reads getUserSessionId, getPreviousUserSessionId,
// getUserSessionIdOverride, and getUserSessionAttributes.
const createMockUserSessionManager = (
  attrs: UserSessionAttributes | null = mockAttributes,
  overrides: Partial<UserSessionManagerInternal> = {},
): UserSessionManagerInternal => {
  const base = new NoOpUserSessionManager();
  return Object.assign(base, {
    getUserSessionId: () => (attrs ? attrs['emb.user_session_id'] : null),
    getUserSessionAttributes: () => attrs,
    ...overrides,
  });
};

describe('UserSessionLogRecordProcessor', () => {
  let memoryExporter: InMemoryLogRecordExporter;
  let logger: Logger;

  afterEach(() => {
    logs.disable();
  });

  it('should stamp the 4 session IDs on logs emitted during an active part', () => {
    const userSessionManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });

    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionLogRecordProcessor({ userSessionManager }),
      new UserSessionLogRecordProcessor({
        userSessionManager: createMockUserSessionManager(),
      }),
    ]);
    logger = logs.getLogger('test-logger');

    userSessionManager.startSessionPart();
    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];

    expect(logRecord.attributes['session.id']).to.equal('USER_SESSION_ABC');
    expect(logRecord.attributes['emb.user_session_id']).to.equal(
      'USER_SESSION_ABC',
    );
    expect(logRecord.attributes['session.previous_id']).to.equal('');
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

  it('should stamp empty session IDs on logs emitted outside any session part (spec 2.1)', () => {
    memoryExporter = setupTestLogExporter([
      new UserSessionLogRecordProcessor({
        userSessionManager: createMockUserSessionManager(),
      }),
    ]);
    logger = logs.getLogger('test-logger');

    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];

    // Spec 2.1: events without a part id must not carry a session id.
    expect(logRecord.attributes['session.id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_id']).to.equal('');
    expect(logRecord.attributes['session.previous_id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal('');
    void expect(logRecord.attributes['emb.session_part_id']).to.be.undefined;
  });

  it('should still stamp session.id from setSessionId() override even with no part id', () => {
    const managerWithOverride = createMockUserSessionManager(null, {
      getUserSessionIdOverride: () => 'customer-id',
    });
    memoryExporter = setupTestLogExporter([
      new UserSessionLogRecordProcessor({
        userSessionManager: managerWithOverride,
      }),
    ]);
    logger = logs.getLogger('test-logger');

    logger.emit({ body: 'test log' });

    const logRecord = memoryExporter.getFinishedLogRecords()[0];
    // Customer override is customer-owned; honored regardless of part state.
    expect(logRecord.attributes['session.id']).to.equal('customer-id');
    expect(logRecord.attributes['emb.user_session_id']).to.equal('');
  });

  it('should emit the previous user session id on both keys when available', () => {
    const userSessionManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });

    const managerWithPrevious = createMockUserSessionManager(mockAttributes, {
      getPreviousUserSessionId: () => 'PREVIOUS_USER_SESSION',
    });

    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionLogRecordProcessor({ userSessionManager }),
      new UserSessionLogRecordProcessor({
        userSessionManager: managerWithPrevious,
      }),
    ]);
    logger = logs.getLogger('test-logger');

    userSessionManager.startSessionPart();
    logger.emit({ body: 'test log' });

    const logRecord = memoryExporter.getFinishedLogRecords()[0];
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal(
      'PREVIOUS_USER_SESSION',
    );
    expect(logRecord.attributes['session.previous_id']).to.equal(
      'PREVIOUS_USER_SESSION',
    );
  });

  it('should preserve a user-set session.previous_id while still stamping emb.user_session_previous_id', () => {
    const userSessionManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });

    const managerWithPrevious = createMockUserSessionManager(mockAttributes, {
      getPreviousUserSessionId: () => 'PREVIOUS_USER_SESSION',
    });

    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionLogRecordProcessor({ userSessionManager }),
      new UserSessionLogRecordProcessor({
        userSessionManager: managerWithPrevious,
      }),
    ]);
    logger = logs.getLogger('test-logger');

    userSessionManager.startSessionPart();
    logger.emit({
      body: 'test log',
      attributes: { 'session.previous_id': 'user-override' },
    });

    const logRecord = memoryExporter.getFinishedLogRecords()[0];
    expect(logRecord.attributes['session.previous_id']).to.equal(
      'user-override',
    );
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal(
      'PREVIOUS_USER_SESSION',
    );
  });

  it('should stamp empty-string IDs when no user session is active', () => {
    const userSessionManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });

    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionLogRecordProcessor({ userSessionManager }),
      new UserSessionLogRecordProcessor({
        userSessionManager: createMockUserSessionManager(null),
      }),
    ]);
    logger = logs.getLogger('test-logger');

    userSessionManager.startSessionPart();
    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];

    expect(logRecord.attributes['session.id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_id']).to.equal('');
    expect(logRecord.attributes['session.previous_id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal('');
  });

  it('should leave a user-set session.id untouched when no user session is active', () => {
    const userSessionManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });

    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionLogRecordProcessor({ userSessionManager }),
      new UserSessionLogRecordProcessor({
        userSessionManager: createMockUserSessionManager(null),
      }),
    ]);
    logger = logs.getLogger('test-logger');

    userSessionManager.startSessionPart();
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
    const userSessionManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });

    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionLogRecordProcessor({ userSessionManager }),
      new UserSessionLogRecordProcessor({
        userSessionManager: createMockUserSessionManager(),
      }),
    ]);
    logger = logs.getLogger('test-logger');

    userSessionManager.startSessionPart();
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

  it('should swallow exceptions from the user session manager and stamp empty-string IDs', () => {
    const userSessionManager = new EmbraceUserSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });
    const throwingManager = createMockUserSessionManager(mockAttributes, {
      getUserSessionId: () => {
        throw new Error('boom');
      },
    });

    memoryExporter = setupTestLogExporter([
      new IdentifiableSessionLogRecordProcessor({ userSessionManager }),
      new UserSessionLogRecordProcessor({
        userSessionManager: throwingManager,
      }),
    ]);
    logger = logs.getLogger('test-logger');

    userSessionManager.startSessionPart();

    expect(() => logger.emit({ body: 'test log' })).to.not.throw();

    const logRecord = memoryExporter.getFinishedLogRecords()[0];
    // Four-attribute contract holds even on failure.
    expect(logRecord.attributes['emb.user_session_id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal('');
    expect(logRecord.attributes['session.id']).to.equal('');
    expect(logRecord.attributes['session.previous_id']).to.equal('');
  });
});
