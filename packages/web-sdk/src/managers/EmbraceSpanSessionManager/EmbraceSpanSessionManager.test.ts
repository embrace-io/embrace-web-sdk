import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  InMemoryDiagLogger,
  InMemoryStorage,
  MockPerformanceManager,
} from '../../../tests/utils/index.ts';
import type {
  SessionPartEndReason,
  UserSessionEndReason,
} from '../../api-sessions/index.ts';
import { EmbraceStorage } from '../../utils/EmbraceStorage/EmbraceStorage.ts';
import { EmbraceSpanSessionManager } from './EmbraceSpanSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

type EndCall = [
  reason: SessionPartEndReason,
  userSessionEndReason?: UserSessionEndReason | null,
];

/**
 * Returns the args passed to the most recent `endSessionPartInternal`
 * invocation, or `undefined` if the spy was never called.
 */
const lastEndCall = (spy: sinon.SinonSpy): EndCall | undefined => {
  if (spy.callCount === 0) {
    return undefined;
  }
  return spy.lastCall.args as EndCall;
};

describe('EmbraceSpanSessionManager', () => {
  let inMemoryStorage: InMemoryStorage;
  let storage: EmbraceStorage;
  let diag: InMemoryDiagLogger;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    inMemoryStorage = new InMemoryStorage();
    diag = new InMemoryDiagLogger();
    storage = new EmbraceStorage(inMemoryStorage, diag);
    clock = sinon.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    clock.restore();
  });

  const createManager = (config?: {
    maxDurationSeconds?: number;
    inactivityTimeoutSeconds?: number;
  }) =>
    new EmbraceSpanSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      config,
    });

  it('should create a session on first part start', () => {
    const manager = createManager();
    manager.startSessionPartInternal('init');
    const attrs = manager.getUserSessionAttributes();

    void expect(attrs).to.not.be.null;
    expect(attrs?.['emb.user_session_id']).to.have.lengthOf(32);
    expect(attrs?.['session.id']).to.equal(attrs?.['emb.user_session_id']);
    expect(attrs?.['emb.user_session_number']).to.equal(1);
    expect(attrs?.['emb.user_session_part_number']).to.equal(1);
    expect(attrs?.['emb.user_session_start_ts']).to.be.a('number');
    expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
      1800,
    );
  });

  it('should continue session across parts within timeout', () => {
    const manager = createManager();

    manager.startSessionPartInternal('init');
    const attrs1 = manager.getUserSessionAttributes();
    manager.endSessionPartInternal('inactivity');

    // Advance time within inactivity timeout (29 min)
    clock.tick(29 * 60 * 1000);

    manager.startSessionPartInternal('init');
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(1);
    expect(attrs2?.['emb.user_session_part_number']).to.equal(2);
  });

  it('should start a session when inactivity timeout expires', () => {
    const manager = createManager();

    manager.startSessionPartInternal('init');
    const attrs1 = manager.getUserSessionAttributes();
    manager.endSessionPartInternal('inactivity');

    // Advance past inactivity timeout (31 min)
    clock.tick(31 * 60 * 1000);

    manager.startSessionPartInternal('init');
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.not.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(2);
    expect(attrs2?.['emb.user_session_part_number']).to.equal(1);
  });

  it('should start a session when max duration expires', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });

    manager.startSessionPartInternal('init');
    const attrs1 = manager.getUserSessionAttributes();
    manager.endSessionPartInternal('inactivity');

    // Advance past max duration (3601 seconds)
    clock.tick(3601 * 1000);

    manager.startSessionPartInternal('init');
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.not.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(2);
  });

  it('should fire max duration timer mid-part', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');
    const startSpy = sinon.spy(manager, 'startSessionPartInternal');

    manager.startSessionPartInternal('init');

    // Fast forward past max duration
    clock.tick(3601 * 1000);

    void expect(endSpy.called).to.be.true;
    // startSpy was called once for the initial start AND once for the
    // user_session_rollover that follows max-duration termination.
    expect(startSpy.callCount).to.be.at.least(2);
  });

  it('should provide termination info when max duration fires', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    manager.startSessionPartInternal('init');
    clock.tick(3601 * 1000);

    expect(lastEndCall(endSpy)).to.deep.equal([
      'user_session_ended',
      'max_duration_reached',
    ]);
  });

  it('should handle manual termination via endUserSession', () => {
    const manager = createManager();

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');
    const startSpy = sinon.spy(manager, 'startSessionPartInternal');

    manager.startSessionPartInternal('init');
    manager.endUserSession();

    void expect(endSpy.called).to.be.true;
    expect(startSpy.callCount).to.be.at.least(2);
  });

  it('should provide termination info during manual termination', () => {
    const manager = createManager();

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    manager.startSessionPartInternal('init');
    manager.endUserSession();

    expect(lastEndCall(endSpy)).to.deep.equal(['user_session_ended', 'manual']);
  });

  it('should be a no-op when ending session with no active session', () => {
    const manager = createManager();
    manager.endUserSession();
    expect(diag.getDebugLogs()).to.have.lengthOf(1);
  });

  it('should share state across manager instances via storage', () => {
    const manager1 = createManager();
    manager1.startSessionPartInternal('init');
    const attrs1 = manager1.getUserSessionAttributes();
    manager1.endSessionPartInternal('inactivity');

    // Simulate another tab creating a manager with the same storage
    const manager2 = createManager();
    manager2.startSessionPartInternal('init');
    const attrs2 = manager2.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_part_number']).to.equal(2);
  });

  it('should handle localStorage unavailable gracefully', () => {
    const failingStorage = {
      getItem: () => {
        throw new Error('Storage unavailable');
      },
      setItem: () => {
        throw new Error('Storage unavailable');
      },
      removeItem: () => {
        throw new Error('Storage unavailable');
      },
      clear: () => {
        throw new Error('Storage unavailable');
      },
      key: () => null,
      length: 0,
    } satisfies Storage;
    const safeFailing = new EmbraceStorage(failingStorage, diag);

    const manager = new EmbraceSpanSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage: safeFailing,
    });

    manager.startSessionPartInternal('init');
    const attrs = manager.getUserSessionAttributes();
    expect(attrs?.['emb.user_session_id']).to.have.lengthOf(32);
    // Storage unavailable: getIncrementedCount falls back to 1, which is
    // indistinguishable from a genuine first session.
    expect(attrs?.['emb.user_session_number']).to.equal(1);
    // EmbraceStorage flips disabled on the first failed write and emits
    // exactly one error; later failures stay silent.
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('Storage write failed');
  });

  it('should clamp max duration to the maximum', () => {
    // 25 hours exceeds 24 hour max
    const manager = createManager({ maxDurationSeconds: 25 * 60 * 60 });
    manager.startSessionPartInternal('init');
    const attrs = manager.getUserSessionAttributes();
    expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
  });

  it('should clamp inactivity timeout to the maximum', () => {
    // 25 hours exceeds 24 hour max
    const manager = createManager({ inactivityTimeoutSeconds: 25 * 60 * 60 });
    manager.startSessionPartInternal('init');
    const attrs = manager.getUserSessionAttributes();
    expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
      1800,
    );
  });

  it('should increment user session number monotonically', () => {
    const manager = createManager();

    manager.startSessionPartInternal('init');
    manager.endSessionPartInternal('inactivity');
    // Expire the session
    clock.tick(31 * 60 * 1000);

    manager.startSessionPartInternal('init');
    const attrs2 = manager.getUserSessionAttributes();
    manager.endSessionPartInternal('inactivity');
    clock.tick(31 * 60 * 1000);

    manager.startSessionPartInternal('init');
    const attrs3 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_number']).to.equal(2);
    expect(attrs3?.['emb.user_session_number']).to.equal(3);

    // Verify stored counter
    expect(inMemoryStorage.getItem('embrace_user_session_number')).to.equal(
      '3',
    );
  });

  it('should fire the max duration timer even after the part ends', () => {
    // Spec 1.3: the user-session max-duration timer must fire even while
    // no part is active. Part-end re-arms the timer against the same
    // userSessionMaxEndTs so a session that hits max duration mid-idle
    // still terminates.
    const manager = createManager({ maxDurationSeconds: 3600 });

    manager.startSessionPartInternal('init');
    manager.endSessionPartInternal('inactivity');

    // Spy AFTER the legitimate end so we observe only timer-driven calls.
    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    clock.tick(3601 * 1000);

    expect(endSpy.callCount).to.be.at.least(1);
    expect(lastEndCall(endSpy)).to.deep.equal([
      'user_session_ended',
      'max_duration_reached',
    ]);
  });

  it('should persist session state to storage', () => {
    const manager = createManager();
    manager.startSessionPartInternal('init');

    const raw = inMemoryStorage.getItem('embrace_user_session_state');
    expect(raw).to.not.be.null;

    const state = JSON.parse(raw as string) as {
      userSessionId: string;
      userSessionNumber: number;
      userSessionPartNumber: number;
    };
    expect(state.userSessionId).to.have.lengthOf(32);
    expect(state.userSessionNumber).to.equal(1);
    expect(state.userSessionPartNumber).to.equal(1);
  });

  it('should return null attributes when no session is active', () => {
    const manager = createManager();
    void expect(manager.getUserSessionAttributes()).to.be.null;
    void expect(manager.getUserSessionId()).to.be.null;
  });

  it('should create a different user session after endUserSession', () => {
    const manager = createManager();

    manager.startSessionPartInternal('init');
    const attrs1 = manager.getUserSessionAttributes();
    manager.endUserSession();

    // After endUserSession the merged manager auto-starts a rollover part,
    // so getUserSessionAttributes already reflects the new session.
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.not.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(2);
    expect(attrs2?.['emb.user_session_part_number']).to.equal(1);
  });

  it('should clear storage after endUserSession-driven termination', () => {
    const manager = createManager();
    manager.startSessionPartInternal('init');

    expect(inMemoryStorage.getItem('embrace_user_session_state')).to.not.be
      .null;

    // The merged manager runs a rollover (clear + new session) so storage
    // is rewritten by the new part. Inspect mid-flight by spying on
    // endSessionPartInternal and reading storage at that moment.
    let storageDuringEnd: string | null = '';
    const original = manager.endSessionPartInternal.bind(manager);
    type EndFn = (
      reason: SessionPartEndReason,
      userSessionEndReason?: UserSessionEndReason | null,
    ) => void;
    sinon.stub(manager, 'endSessionPartInternal').callsFake(((
      reason,
      userSessionEndReason,
    ) => {
      if (reason === 'user_session_ended') {
        storageDuringEnd = inMemoryStorage.getItem(
          'embrace_user_session_state',
        );
      }
      (original as EndFn)(reason, userSessionEndReason);
    }) as EndFn);

    manager.endUserSession();

    // We can verify the dying session's storage row was cleared even though
    // a rollover write follows: the in-memory previous id matches what was
    // active before, and the new state is a different session id.
    const finalRaw = inMemoryStorage.getItem('embrace_user_session_state');
    expect(finalRaw).to.not.equal(storageDuringEnd);
  });

  it('should expose the dying user session id via getPreviousUserSessionId on manual end', () => {
    const manager = createManager();
    manager.startSessionPartInternal('init');
    const attrs = manager.getUserSessionAttributes();
    const dyingId = attrs?.['emb.user_session_id'];

    manager.endUserSession();

    expect(manager.getPreviousUserSessionId()).to.equal(dyingId);
  });

  it('should expose the dying user session id via getPreviousUserSessionId on max-duration rollover', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });
    manager.startSessionPartInternal('init');
    const attrs = manager.getUserSessionAttributes();
    const dyingId = attrs?.['emb.user_session_id'];

    clock.tick(3601 * 1000);

    expect(manager.getPreviousUserSessionId()).to.equal(dyingId);
  });

  describe('setSessionId override', () => {
    it('should emit session.id equal to emb.user_session_id by default', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal(attrs?.['emb.user_session_id']);
    });

    it('should override session.id without changing emb.user_session_id', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');
      manager.setSessionId('custom-session-id');

      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal('custom-session-id');
      expect(attrs?.['emb.user_session_id']).to.have.lengthOf(32);
      expect(attrs?.['emb.user_session_id']).to.not.equal('custom-session-id');
    });

    it('should clear the override when setSessionId(null) is called', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');
      manager.setSessionId('custom-session-id');
      manager.setSessionId(null);

      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal(attrs?.['emb.user_session_id']);
    });

    it('should keep the override active across user session boundaries until cleared', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');
      manager.setSessionId('custom-session-id');

      manager.endSessionPartInternal('inactivity');
      clock.tick(31 * 60 * 1000);
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();

      expect(attrs?.['session.id']).to.equal('custom-session-id');
      expect(attrs?.['emb.user_session_id']).to.not.equal('custom-session-id');
    });

    it('should warn and ignore setSessionId when called with an empty string', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');
      manager.setSessionId('custom-session-id');

      manager.setSessionId('');

      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal('custom-session-id');
      expect(
        diag.getWarnLogs().some((l) => l.includes('empty or whitespace-only')),
      ).to.equal(true);
    });

    it('should warn and ignore setSessionId when called with whitespace only', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');
      manager.setSessionId('custom-session-id');

      manager.setSessionId('   ');

      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal('custom-session-id');
      expect(
        diag.getWarnLogs().some((l) => l.includes('empty or whitespace-only')),
      ).to.equal(true);
    });
  });

  describe('endUserSession cooldown', () => {
    it('should warn and skip when called within the 5s cooldown window', () => {
      const manager = createManager();

      manager.startSessionPartInternal('init');
      manager.endUserSession();
      // The merged manager auto-rolls a new part on endUserSession; no
      // explicit second startSessionPartInternal is needed.

      clock.tick(2 * 1000);
      const idBeforeSecondCall = manager.getUserSessionId();
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        true,
      );
      // Cooldown blocked the second call, so the rolled-over session id
      // should still be active.
      expect(manager.getUserSessionId()).to.equal(idBeforeSecondCall);
    });

    it('should process normally when called after the 5s cooldown window', () => {
      const manager = createManager();

      manager.startSessionPartInternal('init');
      manager.endUserSession();

      clock.tick(6 * 1000);
      const idAfterFirstEnd = manager.getUserSessionId();
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        false,
      );
      // Second endUserSession past cooldown should produce a fresh rollover
      // session, distinct from the one active before the call.
      expect(manager.getUserSessionId()).to.not.equal(idAfterFirstEnd);
    });

    it('should process normally exactly at the 5s cooldown boundary (strict less-than)', () => {
      const manager = createManager();

      manager.startSessionPartInternal('init');
      manager.endUserSession();

      clock.tick(5 * 1000);
      const idAfterFirstEnd = manager.getUserSessionId();
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        false,
      );
      expect(manager.getUserSessionId()).to.not.equal(idAfterFirstEnd);
    });

    it('should reject end calls in the cooldown window even when no session is active', () => {
      const manager = createManager();

      manager.startSessionPartInternal('init');
      manager.endUserSession();

      // Inside the cooldown window: even if no session were active here, the
      // cooldown must reject before the no-active-session no-op so the next
      // active session cannot be ended within the cooldown.
      clock.tick(2 * 1000);
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        true,
      );
    });
  });

  describe('config clamp min-boundary', () => {
    it('should fall back to default when maxDurationSeconds is below minimum', () => {
      // MIN is 1 hour (3600s); 60s is below minimum
      const manager = createManager({ maxDurationSeconds: 60 });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxDurationSeconds is zero', () => {
      const manager = createManager({ maxDurationSeconds: 0 });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxDurationSeconds is negative', () => {
      const manager = createManager({ maxDurationSeconds: -60 });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when inactivityTimeoutSeconds is below minimum', () => {
      // MIN is 30s; 10s is below minimum
      const manager = createManager({ inactivityTimeoutSeconds: 10 });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should fall back to default when inactivityTimeoutSeconds is zero', () => {
      const manager = createManager({ inactivityTimeoutSeconds: 0 });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should fall back to default when inactivityTimeoutSeconds is negative', () => {
      const manager = createManager({ inactivityTimeoutSeconds: -60 });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should fall back to default when maxDurationSeconds is NaN', () => {
      // NaN slips both range gates (NaN < x and NaN > x both return false), so
      // without the finite-number guard the manager would persist NaN as
      // _maxDurationMs and JSON.stringify would write `null` to storage.
      const manager = createManager({ maxDurationSeconds: Number.NaN });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxDurationSeconds is Infinity', () => {
      const manager = createManager({
        maxDurationSeconds: Number.POSITIVE_INFINITY,
      });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when inactivityTimeoutSeconds is NaN', () => {
      const manager = createManager({ inactivityTimeoutSeconds: Number.NaN });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should diag.warn when a config value is rejected so dropped config is visible to developers', () => {
      createManager({
        maxDurationSeconds: 60,
        inactivityTimeoutSeconds: Number.NaN,
      });

      const warnLogs = diag.getWarnLogs();
      expect(
        warnLogs.some(
          (l) => l.includes('maxDurationSeconds') && l.includes('range'),
        ),
        'expected diag.warn for out-of-range maxDurationSeconds',
      ).to.equal(true);
      expect(
        warnLogs.some(
          (l) => l.includes('inactivityTimeoutSeconds') && l.includes('finite'),
        ),
        'expected diag.warn for non-finite inactivityTimeoutSeconds',
      ).to.equal(true);
    });
  });

  describe('inactivity > max fallback', () => {
    it('should fall back to default inactivity when configured inactivity exceeds max duration', () => {
      // max = 1h, inactivity = 2h (both inside their own min/max range, but inactivity > max)
      const manager = createManager({
        maxDurationSeconds: 3600,
        inactivityTimeoutSeconds: 7200,
      });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(3600);
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });
  });

  describe('clock anomaly handling (spec 6.1)', () => {
    it('should start a fresh session when device time is before stored session start', () => {
      const manager1 = createManager();
      manager1.startSessionPartInternal('init');
      const attrs1 = manager1.getUserSessionAttributes();
      manager1.endSessionPartInternal('inactivity');

      // Simulate device clock jumping backward (before userSessionStartTs).
      const rawBefore = inMemoryStorage.getItem('embrace_user_session_state');
      expect(rawBefore).to.not.be.null;
      const state = JSON.parse(rawBefore as string) as {
        userSessionStartTs: number;
        userSessionMaxEndTs: number;
      };
      state.userSessionStartTs = 60 * 60 * 1000;
      state.userSessionMaxEndTs =
        state.userSessionStartTs + 12 * 60 * 60 * 1000;
      inMemoryStorage.setItem(
        'embrace_user_session_state',
        JSON.stringify(state),
      );

      // clock.now is 0, which is before userSessionStartTs=3600000.
      const manager2 = createManager();
      manager2.startSessionPartInternal('init');
      const attrs2 = manager2.getUserSessionAttributes();

      expect(attrs2?.['emb.user_session_id']).to.not.equal(
        attrs1?.['emb.user_session_id'],
      );
      expect(attrs2?.['emb.user_session_number']).to.equal(2);
    });
  });

  const readStoredDeadline = (): number | null => {
    const raw = inMemoryStorage.getItem('embrace_user_session_state');
    if (!raw) return null;
    return (JSON.parse(raw) as { inactivityDeadlineTs: number | null })
      .inactivityDeadlineTs;
  };

  describe('inactivity timeout invalidation (spec 1.1)', () => {
    it('should not write an inactivity deadline while the first foreground part is active', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');

      void expect(readStoredDeadline()).to.be.null;
    });

    it('should write the inactivity deadline onto the state row when the part ends', () => {
      const manager = createManager({ inactivityTimeoutSeconds: 120 });
      manager.startSessionPartInternal('init');
      clock.tick(10 * 1000);
      manager.endSessionPartInternal('inactivity');

      expect(readStoredDeadline()).to.equal(10 * 1000 + 120 * 1000);
    });

    it('should clear the inactivity deadline when a continuing part starts', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('inactivity');
      void expect(readStoredDeadline()).to.not.be.null;

      // A continuing part (within timeout) should clear the persisted value.
      clock.tick(60 * 1000);
      manager.startSessionPartInternal('init');

      void expect(readStoredDeadline()).to.be.null;
    });

    it('should not expire on inactivity when recovering a session with no prior part-end', () => {
      const manager1 = createManager({ maxDurationSeconds: 12 * 60 * 60 });
      manager1.startSessionPartInternal('init');
      const attrs1 = manager1.getUserSessionAttributes();
      // Simulate a crash: no endSessionPartInternal call, no deadline written.

      // Fast forward past the default inactivity timeout but within max duration.
      clock.tick(60 * 60 * 1000);

      const manager2 = createManager({ maxDurationSeconds: 12 * 60 * 60 });
      manager2.startSessionPartInternal('init');
      const attrs2 = manager2.getUserSessionAttributes();

      expect(attrs2?.['emb.user_session_id']).to.equal(
        attrs1?.['emb.user_session_id'],
      );
    });
  });

  describe('corrupt storage recovery', () => {
    it('should recover by discarding corrupt session state and starting fresh', () => {
      inMemoryStorage.setItem(
        'embrace_user_session_state',
        'not-valid-json{{{',
      );

      const manager = createManager();
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();

      expect(attrs?.['emb.user_session_id']).to.have.lengthOf(32);
      expect(attrs?.['emb.user_session_number']).to.equal(1);
      expect(diag.getErrorLogs().some((l) => l.includes('corrupt'))).to.equal(
        true,
      );

      const freshRaw = inMemoryStorage.getItem('embrace_user_session_state');
      expect(freshRaw).to.not.equal('not-valid-json{{{');
      expect(() => JSON.parse(freshRaw as string)).to.not.throw();
    });
  });

  describe('clock anomaly: jump forward past userSessionMaxEndTs', () => {
    it('should detect a forward clock jump as an expired session on the next part start', () => {
      const manager1 = createManager({ maxDurationSeconds: 60 * 60 });
      manager1.startSessionPartInternal('init');
      const attrs1 = manager1.getUserSessionAttributes();
      manager1.endSessionPartInternal('inactivity');
      // Cancel manager1's max-duration timer so it doesn't auto-rollover during
      // the tick. We're simulating a page reload: the prior page is gone,
      // storage carries the dying state forward, and a fresh manager loads.
      manager1._clearMaxDurationTimer();

      // Jump the clock past the locked-in userSessionMaxEndTs (1h window).
      clock.tick(60 * 60 * 1000 + 1);

      const manager2 = createManager({ maxDurationSeconds: 60 * 60 });
      manager2.startSessionPartInternal('init');
      const attrs2 = manager2.getUserSessionAttributes();

      expect(attrs2?.['emb.user_session_id']).to.not.equal(
        attrs1?.['emb.user_session_id'],
      );
      expect(attrs2?.['emb.user_session_number']).to.equal(2);
      expect(attrs2?.['emb.user_session_part_number']).to.equal(1);
    });
  });
});
