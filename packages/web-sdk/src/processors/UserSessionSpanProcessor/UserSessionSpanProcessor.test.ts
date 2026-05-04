import type { Attributes, Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { setupTestTraceExporter } from '../../../tests/utils/index.ts';
import {
  mockSessionPartSpan,
  mockSpan,
} from '../../../tests/utils/mock-entities/ReadableSpan.ts';
import { NoOpUserSessionManager } from '../../api-sessions/manager/NoOpUserSessionManager/index.ts';
import type { UserSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/index.ts';
import type { UserSessionAttributes } from '../../managers/EmbraceUserSessionManager/types.ts';
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

// Builds a UserSessionManagerInternal stub by extending NoOpUserSessionManager
// with the methods the processor reads. Includes a settable part id and
// session id override so cross-tab race tests can mutate state mid-span.
const createMockUserSessionManager = (
  attrs: UserSessionAttributes | null = mockAttributes,
  partId: string | null = 'PART123',
  overrides: Partial<UserSessionManagerInternal> = {},
): UserSessionManagerInternal & { setPartId: (id: string | null) => void } => {
  const base = new NoOpUserSessionManager();
  let id: string | null = partId;
  const stub = Object.assign(base, {
    getUserSessionId: () => (attrs ? attrs['emb.user_session_id'] : null),
    getPreviousUserSessionId: () => null,
    getUserSessionAttributes: () => attrs,
    getUserSessionIdOverride: () => null,
    getSessionPartId: () => id,
    ...overrides,
  });
  return Object.assign(stub, {
    setPartId: (v: string | null) => {
      id = v;
    },
  });
};

describe('UserSessionSpanProcessor', () => {
  it('should add the full user session attribute set to session-part spans', () => {
    const processor = new UserSessionSpanProcessor({
      userSessionManager: createMockUserSessionManager(),
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

  it('should preserve pre-stamped part attributes when the manager has rotated to a peer session', () => {
    // Simulates a cross-tab termination during a part's lifetime: the live
    // manager state has advanced to the peer's session (number 7, part 1),
    // but the dying part's own counters were stamped at startSessionPart and
    // must survive onEnd unchanged.
    const peerAttributes: UserSessionAttributes = {
      'session.id': 'PEER_SESSION',
      'emb.user_session_id': 'PEER_SESSION',
      'emb.user_session_number': 7,
      'emb.user_session_part_number': 1,
      'emb.user_session_start_ts': 9999,
      'emb.user_session_max_duration_seconds': 100,
      'emb.user_session_inactivity_timeout_seconds': 50,
    };
    const processor = new UserSessionSpanProcessor({
      userSessionManager: createMockUserSessionManager(peerAttributes),
    });

    const attrs: Attributes = {
      ...mockSessionPartSpan.attributes,
      'emb.session_part_id': 'PART123',
      'emb.user_session_id': 'DYING_SESSION',
      'emb.user_session_previous_id': '',
      'emb.user_session_number': 1,
      'emb.user_session_part_number': 2,
      'emb.user_session_start_ts': 1000,
      'emb.user_session_max_duration_seconds': 43200,
      'emb.user_session_inactivity_timeout_seconds': 1800,
    };
    const span = { ...mockSessionPartSpan, attributes: attrs };

    processor.onEnd(span);

    expect(attrs['emb.user_session_id']).to.equal('DYING_SESSION');
    expect(attrs['emb.user_session_number']).to.equal(1);
    expect(attrs['emb.user_session_part_number']).to.equal(2);
    expect(attrs['emb.user_session_start_ts']).to.equal(1000);
    expect(attrs['emb.user_session_max_duration_seconds']).to.equal(43200);
    expect(attrs['emb.user_session_inactivity_timeout_seconds']).to.equal(1800);
  });

  it('should add only the 4 session IDs to non-session-part spans', () => {
    const processor = new UserSessionSpanProcessor({
      userSessionManager: createMockUserSessionManager(),
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
      userSessionManager: createMockUserSessionManager(mockAttributes, null),
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
    const managerWithOverride = createMockUserSessionManager(null, null, {
      getUserSessionIdOverride: () => 'customer-id',
    });
    const processor = new UserSessionSpanProcessor({
      userSessionManager: managerWithOverride,
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
      userSessionManager: createMockUserSessionManager(null, 'PART123'),
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
      userSessionManager: createMockUserSessionManager(null, 'PART123'),
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
      userSessionManager: createMockUserSessionManager(),
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
      userSessionManager: createMockUserSessionManager(),
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
    const managerWithPrevious = createMockUserSessionManager(
      mockAttributes,
      'PART123',
      {
        getPreviousUserSessionId: () => 'PREVIOUS_USER_SESSION',
      },
    );
    const processor = new UserSessionSpanProcessor({
      userSessionManager: managerWithPrevious,
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
    const managerWithPrevious = createMockUserSessionManager(
      mockAttributes,
      'PART123',
      {
        getPreviousUserSessionId: () => 'PREVIOUS_USER_SESSION',
      },
    );
    const processor = new UserSessionSpanProcessor({
      userSessionManager: managerWithPrevious,
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
    const throwingManager = createMockUserSessionManager(
      mockAttributes,
      'PART123',
      {
        getUserSessionId: () => {
          throw new Error('boom');
        },
      },
    );
    const processor = new UserSessionSpanProcessor({
      userSessionManager: throwingManager,
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
  let mutableManager: ReturnType<typeof createMockUserSessionManager>;
  let liveUserSessionId: string;
  let tracer: Tracer;

  before(() => {
    liveUserSessionId = 'USER_SESSION_1';
    mutableManager = createMockUserSessionManager(mockAttributes, 'PART123', {
      getUserSessionId: () => liveUserSessionId || null,
    });
    memoryExporter = setupTestTraceExporter([
      new IdentifiableSessionPartSpanProcessor({
        userSessionManager: mutableManager,
      }),
      new UserSessionSpanProcessor({
        userSessionManager: mutableManager,
      }),
    ]);
    tracer = trace.getTracer('test-tracer-cross-tab');
  });

  beforeEach(() => {
    memoryExporter.reset();
    mutableManager.setPartId('PART123');
    liveUserSessionId = 'USER_SESSION_1';
  });

  it('preserves user-session attribution when termination clears state mid-span', () => {
    const span = tracer.startSpan('long-running');

    // Simulate cross-tab termination: state is cleared and part id is nulled
    // while the span is still in flight. Without onStart snapshotting, span
    // attribution would be stripped here.
    liveUserSessionId = '';
    mutableManager.setPartId(null);

    span.end();

    const finished = memoryExporter.getFinishedSpans();
    expect(finished).to.have.lengthOf(1);
    expect(finished[0].attributes['emb.user_session_id']).to.equal(
      'USER_SESSION_1',
    );
    expect(finished[0].attributes['session.id']).to.equal('USER_SESSION_1');
  });

  it('stamps empty-string for spans that started outside any active part', () => {
    mutableManager.setPartId(null);
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
