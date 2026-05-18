import type { Logger } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import type { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import * as chai from 'chai';
import { setupTestLogExporter } from '../../../tests/utils/index.ts';
import { NoOpUserSessionManager } from '../../api-sessions/manager/NoOpUserSessionManager/index.ts';
import type { UserSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/index.ts';
import type { UserSessionAttributes } from '../../managers/EmbraceUserSessionManager/types.ts';
import { IdentifiableSessionLogRecordProcessor } from './IdentifiableSessionLogRecordProcessor.ts';

const { expect } = chai;

const mockAttributes: UserSessionAttributes = {
  'emb.user_session_id': 'USER_SESSION_ABC',
  'session.id': 'USER_SESSION_ABC',
  'emb.user_session_previous_id': '',
  'session.previous_id': '',
  'emb.user_session_number': 1,
  'emb.user_session_part_index': 3,
  'emb.session_part_number': 7,
  'emb.user_session_start_ts': 1000,
  'emb.user_session_max_duration_seconds': 43200,
  'emb.user_session_inactivity_timeout_seconds': 1800,
};

// Stub built on top of NoOpUserSessionManager so we satisfy the full
// UserSessionManagerInternal surface without listing every method. A non-null
// `attrs` models an active user session, which implies an active part; a null
// `attrs` models neither.
const createMockUserSessionManager = (
  attrs: UserSessionAttributes | null = mockAttributes,
  overrides: Partial<UserSessionManagerInternal> = {},
): UserSessionManagerInternal => {
  const base = new NoOpUserSessionManager();
  return Object.assign(base, {
    getUserSessionId: () => (attrs ? attrs['emb.user_session_id'] : null),
    getSessionPartId: () => (attrs ? 'PART_XYZ' : null),
    getUserSessionAttributes: () => attrs,
    ...overrides,
  });
};

const setup = (manager: UserSessionManagerInternal) => {
  const memoryExporter = setupTestLogExporter([
    new IdentifiableSessionLogRecordProcessor({ userSessionManager: manager }),
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
    ({ memoryExporter, logger } = setup(createMockUserSessionManager()));

    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    expect(logRecord.attributes['log.record.uid']).to.have.lengthOf(32);
    expect(logRecord.attributes['emb.session_part_id']).to.equal('PART_XYZ');
  });

  it('should stamp empty session ids when the manager has no user session at all', () => {
    ({ memoryExporter, logger } = setup(createMockUserSessionManager(null)));

    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    expect(logRecord.attributes['log.record.uid']).to.have.lengthOf(32);
    expect(logRecord.attributes['emb.session_part_id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal('');
  });

  it('should stamp the user-session id (and empty part id) when no part is active but a user session exists', () => {
    // Invariant: emb.user_session_id is never blank when the manager has a
    // user session, even if no part is currently active.
    ({ memoryExporter, logger } = setup(
      createMockUserSessionManager(mockAttributes, {
        getSessionPartId: () => null,
      }),
    ));

    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    expect(logRecord.attributes['emb.session_part_id']).to.equal('');
    expect(logRecord.attributes['emb.user_session_id']).to.equal(
      'USER_SESSION_ABC',
    );
  });

  it('should stamp the 3 session ids on logs emitted during an active part', () => {
    ({ memoryExporter, logger } = setup(createMockUserSessionManager()));

    logger.emit({ body: 'test log' });

    const finishedLogs = memoryExporter.getFinishedLogRecords();
    expect(finishedLogs).to.have.lengthOf(1);
    const logRecord = finishedLogs[0];
    expect(logRecord.attributes['emb.user_session_id']).to.equal(
      'USER_SESSION_ABC',
    );
    expect(logRecord.attributes['emb.user_session_previous_id']).to.equal('');

    // Session-part-only keys must not appear on logs.
    void expect(logRecord.attributes['emb.user_session_number']).to.be
      .undefined;
    void expect(logRecord.attributes['emb.user_session_part_index']).to.be
      .undefined;
    void expect(logRecord.attributes['emb.session_part_number']).to.be
      .undefined;
    void expect(logRecord.attributes['emb.user_session_start_ts']).to.be
      .undefined;
    void expect(logRecord.attributes['emb.user_session_max_duration_seconds'])
      .to.be.undefined;
    void expect(
      logRecord.attributes['emb.user_session_inactivity_timeout_seconds'],
    ).to.be.undefined;
  });

  it('should emit the previous user session id on emb.user_session_previous_id when available', () => {
    ({ memoryExporter, logger } = setup(
      createMockUserSessionManager(mockAttributes, {
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
});
