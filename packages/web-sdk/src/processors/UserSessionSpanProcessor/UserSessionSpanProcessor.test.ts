import type { Attributes, Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { setupTestTraceExporter } from '../../../tests/utils/index.ts';
import {
  mockSessionPartSpan,
  mockSpan,
} from '../../../tests/utils/mock-entities/ReadableSpan.ts';
import type { SessionPartManager } from '../../api-sessions/index.ts';
import type { UserSessionLifecycleManager } from '../../managers/EmbraceUserSessionManager/index.ts';
import type {
  SessionIds,
  UserSessionAttributes,
} from '../../managers/EmbraceUserSessionManager/types.ts';
import { IdentifiableSessionPartSpanProcessor } from '../IdentifiableSessionPartSpanProcessor/index.ts';
import { UserSessionSpanProcessor } from './UserSessionSpanProcessor.ts';

const { expect } = chai;

const mockAttributes: UserSessionAttributes = {
  'session.id': 'ABC123',
  'emb.user_session_id': 'ABC123',
  'emb.user_session_number': 1,
  'emb.user_session_part_number': 2,
  'emb.user_session_start_ts': 1000,
  'emb.user_session_max_duration_seconds': 43200,
  'emb.user_session_inactivity_timeout_seconds': 1800,
};

const buildIds = (attrs: UserSessionAttributes | null): SessionIds => ({
  sessionId: attrs ? attrs['session.id'] : '',
  sessionPreviousId: '',
  userSessionId: attrs ? attrs['emb.user_session_id'] : '',
  userSessionPreviousId: '',
  sessionIdOverride: null,
});

const createMockUserSessionLifecycleManager = (
  attrs: UserSessionAttributes | null = mockAttributes,
  overrides: Partial<UserSessionLifecycleManager> = {},
): UserSessionLifecycleManager => ({
  getUserSessionId: () => (attrs ? attrs['emb.user_session_id'] : null),
  getPreviousUserSessionId: () => null,
  getUserSessionStartTime: () => null,
  getUserSessionAttributes: () => attrs,
  getSessionIds: () => buildIds(attrs),
  onSessionPartStart: () => mockAttributes,
  onSessionPartEnd: () => {},
  setSessionPartCallbacks: () => {},
  getTerminationInfo: () => ({ isFinal: false, reason: null }),
  endUserSession: () => {},
  setSessionId: () => {},
  addUserSessionStartedListener: () => () => {},
  addUserSessionEndedListener: () => () => {},
  ...overrides,
});

const createStubPartManager = (
  partId: string | null,
): SessionPartManager & { setId: (id: string | null) => void } => {
  let id: string | null = partId;
  const noop = () => {};
  return {
    setId: (v) => {
      id = v;
    },
    getSessionPartId: () => id,
    getPreviousSessionPartId: () => null,
    getSessionPartStartTime: () => null,
    getSessionPartSpan: () => null,
    startSessionPart: noop,
    endSessionPart: noop,
    addBreadcrumb: noop,
    addProperty: noop,
    removeProperty: noop,
    endSessionPartInternal: noop,
    incrSessionPartCountForKey: noop,
    incrNextSessionPartCountForKey: noop,
    addSessionPartStartedListener: () => () => {},
    addSessionPartEndedListener: () => () => {},
  };
};

describe('UserSessionSpanProcessor', () => {
  it('should add the full user session attribute set to session-part spans', () => {
    const processor = new UserSessionSpanProcessor({
      userSessionManager: createMockUserSessionLifecycleManager(),
      sessionPartManager: createStubPartManager('PART123'),
    });

    const attrs: Attributes = {
      ...mockSessionPartSpan.attributes,
      'emb.session_part_id': 'PART123',
    };
    const span = { ...mockSessionPartSpan, attributes: attrs };

    processor.onEnd(span);

    expect(attrs['session.id']).to.equal('ABC123');
    expect(attrs['emb.user_session_id']).to.equal('ABC123');
    expect(attrs['emb.user_session_number']).to.equal(1);
    expect(attrs['emb.user_session_part_number']).to.equal(2);
    expect(attrs['emb.user_session_start_ts']).to.equal(1000);
    expect(attrs['emb.user_session_max_duration_seconds']).to.equal(43200);
    expect(attrs['emb.user_session_inactivity_timeout_seconds']).to.equal(1800);
  });

  it('should add only the 4 session IDs to non-session-part spans', () => {
    const processor = new UserSessionSpanProcessor({
      userSessionManager: createMockUserSessionLifecycleManager(),
      sessionPartManager: createStubPartManager('PART123'),
    });

    const attrs: Attributes = {
      'emb.session_part_id': 'PART123',
    };
    const span = { ...mockSpan, attributes: attrs };
    void expect(span.attributes['emb.type']).to.be.undefined;

    processor.onEnd(span);

    expect(attrs['session.id']).to.equal('ABC123');
    expect(attrs['emb.user_session_id']).to.equal('ABC123');
    void expect(attrs['emb.user_session_number']).to.be.undefined;
    void expect(attrs['emb.user_session_part_number']).to.be.undefined;
    void expect(attrs['emb.user_session_start_ts']).to.be.undefined;
    void expect(attrs['emb.user_session_max_duration_seconds']).to.be.undefined;
    void expect(attrs['emb.user_session_inactivity_timeout_seconds']).to.be
      .undefined;
  });

  it('should stamp empty session IDs on spans without a session part ID (spec 2.1)', () => {
    const processor = new UserSessionSpanProcessor({
      userSessionManager: createMockUserSessionLifecycleManager(),
      sessionPartManager: createStubPartManager(null),
    });

    const attrs: Attributes = {};
    const span = { ...mockSpan, attributes: attrs };

    processor.onEnd(span);

    // Spec 2.1: events without a part id must not carry a session id.
    expect(attrs['session.id']).to.equal('');
    expect(attrs['emb.user_session_id']).to.equal('');
    expect(attrs['emb.user_session_previous_id']).to.equal('');
    expect(attrs['session.previous_id']).to.equal('');
  });

  it('should still stamp session.id from setSessionId() override even with no part id', () => {
    const managerWithOverride: UserSessionLifecycleManager =
      createMockUserSessionLifecycleManager(null, {
        getSessionIds: () => ({
          sessionId: 'customer-id',
          sessionPreviousId: '',
          userSessionId: '',
          userSessionPreviousId: '',
          sessionIdOverride: 'customer-id',
        }),
      });
    const processor = new UserSessionSpanProcessor({
      userSessionManager: managerWithOverride,
      sessionPartManager: createStubPartManager(null),
    });

    const attrs: Attributes = {};
    const span = { ...mockSpan, attributes: attrs };

    processor.onEnd(span);

    // Customer override is customer-owned attribution; honored regardless of
    // part state. emb.user_session_id remains empty (SDK-owned, gated).
    expect(attrs['session.id']).to.equal('customer-id');
    expect(attrs['emb.user_session_id']).to.equal('');
  });

  it('should stamp empty-string IDs when no user session is active', () => {
    const processor = new UserSessionSpanProcessor({
      userSessionManager: createMockUserSessionLifecycleManager(null),
      sessionPartManager: createStubPartManager('PART123'),
    });

    const attrs: Attributes = {
      'emb.session_part_id': 'PART123',
    };
    const span = { ...mockSpan, attributes: attrs };

    processor.onEnd(span);

    expect(attrs['session.id']).to.equal('');
    expect(attrs['emb.user_session_id']).to.equal('');
    expect(attrs['session.previous_id']).to.equal('');
    expect(attrs['emb.user_session_previous_id']).to.equal('');
  });

  it('should leave a user-set session.id untouched when no user session is active', () => {
    const processor = new UserSessionSpanProcessor({
      userSessionManager: createMockUserSessionLifecycleManager(null),
      sessionPartManager: createStubPartManager('PART123'),
    });

    const attrs: Attributes = {
      ...mockSpan.attributes,
      'emb.session_part_id': 'PART123',
      'session.id': 'user-override',
    };
    const span = { ...mockSpan, attributes: attrs };

    processor.onEnd(span);

    expect(attrs['session.id']).to.equal('user-override');
    expect(attrs['emb.user_session_id']).to.equal('');
  });

  it('should preserve a user-set session.id on session-part spans while applying the rest of the user session attributes', () => {
    const processor = new UserSessionSpanProcessor({
      userSessionManager: createMockUserSessionLifecycleManager(),
      sessionPartManager: createStubPartManager('PART123'),
    });

    const attrs: Attributes = {
      ...mockSessionPartSpan.attributes,
      'emb.session_part_id': 'PART123',
      'session.id': 'user-override',
    };
    const span = { ...mockSessionPartSpan, attributes: attrs };

    processor.onEnd(span);

    expect(attrs['session.id']).to.equal('user-override');
    expect(attrs['emb.user_session_id']).to.equal('ABC123');
    expect(attrs['emb.user_session_number']).to.equal(1);
    expect(attrs['emb.user_session_part_number']).to.equal(2);
  });

  it('should emit empty-string previous-id keys when no previous user session exists', () => {
    const processor = new UserSessionSpanProcessor({
      userSessionManager: createMockUserSessionLifecycleManager(),
      sessionPartManager: createStubPartManager('PART123'),
    });

    const attrs: Attributes = {
      ...mockSpan.attributes,
      'emb.session_part_id': 'PART123',
    };
    const span = { ...mockSpan, attributes: attrs };

    processor.onEnd(span);

    expect(attrs['emb.user_session_previous_id']).to.equal('');
    expect(attrs['session.previous_id']).to.equal('');
  });

  it('should emit the previous user session id on both keys when available', () => {
    const managerWithPrevious: UserSessionLifecycleManager =
      createMockUserSessionLifecycleManager(mockAttributes, {
        getPreviousUserSessionId: () => 'PREVIOUS_USER_SESSION',
        getSessionIds: () => ({
          sessionId: 'ABC123',
          sessionPreviousId: 'PREVIOUS_USER_SESSION',
          userSessionId: 'ABC123',
          userSessionPreviousId: 'PREVIOUS_USER_SESSION',
          sessionIdOverride: null,
        }),
      });
    const processor = new UserSessionSpanProcessor({
      userSessionManager: managerWithPrevious,
      sessionPartManager: createStubPartManager('PART123'),
    });

    const attrs: Attributes = {
      ...mockSpan.attributes,
      'emb.session_part_id': 'PART123',
    };
    const span = { ...mockSpan, attributes: attrs };

    processor.onEnd(span);

    expect(attrs['emb.user_session_previous_id']).to.equal(
      'PREVIOUS_USER_SESSION',
    );
    expect(attrs['session.previous_id']).to.equal('PREVIOUS_USER_SESSION');
  });

  it('should preserve a user-set session.previous_id while still stamping emb.user_session_previous_id', () => {
    const managerWithPrevious: UserSessionLifecycleManager =
      createMockUserSessionLifecycleManager(mockAttributes, {
        getPreviousUserSessionId: () => 'PREVIOUS_USER_SESSION',
        getSessionIds: () => ({
          sessionId: 'ABC123',
          sessionPreviousId: 'PREVIOUS_USER_SESSION',
          userSessionId: 'ABC123',
          userSessionPreviousId: 'PREVIOUS_USER_SESSION',
          sessionIdOverride: null,
        }),
      });
    const processor = new UserSessionSpanProcessor({
      userSessionManager: managerWithPrevious,
      sessionPartManager: createStubPartManager('PART123'),
    });

    const attrs: Attributes = {
      ...mockSpan.attributes,
      'emb.session_part_id': 'PART123',
      'session.previous_id': 'user-override',
    };
    const span = { ...mockSpan, attributes: attrs };

    processor.onEnd(span);

    expect(attrs['session.previous_id']).to.equal('user-override');
    expect(attrs['emb.user_session_previous_id']).to.equal(
      'PREVIOUS_USER_SESSION',
    );
  });

  it('should swallow exceptions from the user session manager and stamp empty-string IDs', () => {
    const throwingManager: UserSessionLifecycleManager =
      createMockUserSessionLifecycleManager(mockAttributes, {
        getSessionIds: () => {
          throw new Error('boom');
        },
      });
    const processor = new UserSessionSpanProcessor({
      userSessionManager: throwingManager,
      sessionPartManager: createStubPartManager('PART123'),
    });

    const attrs: Attributes = {};
    const span = { ...mockSpan, attributes: attrs };

    expect(() => processor.onEnd(span)).to.not.throw();
    // Four-attribute contract holds even on failure.
    expect(attrs['emb.user_session_id']).to.equal('');
    expect(attrs['emb.user_session_previous_id']).to.equal('');
    expect(attrs['session.id']).to.equal('');
    expect(attrs['session.previous_id']).to.equal('');
  });
});

describe('UserSessionSpanProcessor (cross-tab termination race)', () => {
  let memoryExporter: InMemorySpanExporter;
  let stubPartManager: ReturnType<typeof createStubPartManager>;
  let mutableManager: UserSessionLifecycleManager;
  let mutableIds: SessionIds;
  let tracer: Tracer;

  before(() => {
    stubPartManager = createStubPartManager('PART123');
    mutableIds = {
      sessionId: 'USER_SESSION_1',
      sessionPreviousId: '',
      userSessionId: 'USER_SESSION_1',
      userSessionPreviousId: '',
      sessionIdOverride: null,
    };
    mutableManager = createMockUserSessionLifecycleManager(mockAttributes, {
      getSessionIds: () => mutableIds,
    });
    memoryExporter = setupTestTraceExporter([
      new IdentifiableSessionPartSpanProcessor({
        sessionPartManager: stubPartManager,
      }),
      new UserSessionSpanProcessor({
        userSessionManager: mutableManager,
        sessionPartManager: stubPartManager,
      }),
    ]);
    tracer = trace.getTracer('test-tracer-cross-tab');
  });

  beforeEach(() => {
    memoryExporter.reset();
    stubPartManager.setId('PART123');
    mutableIds = {
      sessionId: 'USER_SESSION_1',
      sessionPreviousId: '',
      userSessionId: 'USER_SESSION_1',
      userSessionPreviousId: '',
      sessionIdOverride: null,
    };
  });

  it('preserves user-session attribution when termination clears state mid-span', () => {
    const span = tracer.startSpan('long-running');

    // Simulate cross-tab termination: state is cleared and part id is nulled
    // while the span is still in flight. Without onStart snapshotting, span
    // attribution would be stripped here.
    mutableIds = {
      sessionId: '',
      sessionPreviousId: '',
      userSessionId: '',
      userSessionPreviousId: '',
      sessionIdOverride: null,
    };
    stubPartManager.setId(null);

    span.end();

    const finished = memoryExporter.getFinishedSpans();
    expect(finished).to.have.lengthOf(1);
    expect(finished[0].attributes['emb.user_session_id']).to.equal(
      'USER_SESSION_1',
    );
    expect(finished[0].attributes['session.id']).to.equal('USER_SESSION_1');
  });

  it('stamps empty-string for spans that started outside any active part', () => {
    stubPartManager.setId(null);
    const span = tracer.startSpan('outside-part');
    span.end();

    const finished = memoryExporter.getFinishedSpans();
    expect(finished).to.have.lengthOf(1);
    expect(finished[0].attributes['emb.user_session_id']).to.equal('');
    expect(finished[0].attributes['emb.user_session_previous_id']).to.equal('');
    expect(finished[0].attributes['session.id']).to.equal('');
    expect(finished[0].attributes['session.previous_id']).to.equal('');
  });
});
