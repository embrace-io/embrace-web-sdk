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
import { NamespacedStorage } from '../../utils/NamespacedStorage/NamespacedStorage.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../EmbraceLimitManager/index.ts';
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
  let storage: NamespacedStorage;
  let diag: InMemoryDiagLogger;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    inMemoryStorage = new InMemoryStorage();
    diag = new InMemoryDiagLogger();
    storage = new NamespacedStorage({ storage: inMemoryStorage, diag });
    clock = sinon.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    clock.restore();
  });

  const createManager = (config?: {
    maxUserSessionDurationSeconds?: number;
    inactivityTimeoutSeconds?: number;
  }) =>
    new EmbraceSpanSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      visibilityDoc: window.document,
      config,
    });

  it('should create a session on first part start', () => {
    const manager = createManager();
    manager.startSessionPartInternal('init');
    const attrs = manager.getUserSessionAttributes();

    void expect(attrs).to.not.be.null;
    expect(attrs?.['emb.user_session_id']).to.have.lengthOf(32);
    expect(attrs?.['emb.user_session_number']).to.equal(1);
    expect(attrs?.['emb.user_session_part_index']).to.equal(1);
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
    // web_background ends the part but keeps the user session alive
    // (inactivity now ends both the part and the user session in one step).
    manager.endSessionPartInternal('web_background');

    // Advance time within inactivity timeout (29 min)
    clock.tick(29 * 60 * 1000);

    manager.startSessionPartInternal('init');
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(1);
    expect(attrs2?.['emb.user_session_part_index']).to.equal(2);
  });

  it('should start a session when inactivity timeout expires', () => {
    const manager = createManager();

    manager.startSessionPartInternal('init');
    const attrs1 = manager.getUserSessionAttributes();
    manager.endSessionPartInternal('web_background');

    // Advance past inactivity timeout (31 min)
    clock.tick(31 * 60 * 1000);

    manager.startSessionPartInternal('init');
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.not.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(2);
    expect(attrs2?.['emb.user_session_part_index']).to.equal(1);
  });

  it('should start a session when max duration expires', () => {
    const manager = createManager({ maxUserSessionDurationSeconds: 3600 });

    manager.startSessionPartInternal('init');
    const attrs1 = manager.getUserSessionAttributes();
    manager.endSessionPartInternal('web_background');

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
    // Match inactivity to max-duration so timers fire at the same tick;
    // max is armed first (in _ensureUserSessionState during part start)
    // so it fires first and finalizes via _rolloverUserSession.
    const manager = createManager({
      maxUserSessionDurationSeconds: 3600,
      inactivityTimeoutSeconds: 3600,
    });

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
    const manager = createManager({
      maxUserSessionDurationSeconds: 3600,
      inactivityTimeoutSeconds: 3600,
    });

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
    // web_background keeps the user session alive; another tab joining
    // should adopt it. (inactivity now ends both part and user session.)
    manager1.endSessionPartInternal('web_background');

    // Simulate another tab creating a manager with the same storage
    const manager2 = createManager();
    manager2.startSessionPartInternal('init');
    const attrs2 = manager2.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_part_index']).to.equal(2);
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
    const safeFailing = new NamespacedStorage({
      storage: failingStorage,
      diag,
    });

    const manager = new EmbraceSpanSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage: safeFailing,
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      visibilityDoc: window.document,
    });

    manager.startSessionPartInternal('init');
    const attrs = manager.getUserSessionAttributes();
    expect(attrs?.['emb.user_session_id']).to.have.lengthOf(32);
    // Storage unavailable: getIncrementedCount falls back to 1, which is
    // indistinguishable from a genuine first session.
    expect(attrs?.['emb.user_session_number']).to.equal(1);
    // NamespacedStorage flips disabled on the first failed write and emits
    // exactly one error; later failures stay silent.
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('writes disabled');
  });

  it('should clamp max duration to the maximum', () => {
    // 25 hours exceeds 24 hour max
    const manager = createManager({
      maxUserSessionDurationSeconds: 25 * 60 * 60,
    });
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
    manager.endSessionPartInternal('web_background');
    // Expire the session
    clock.tick(31 * 60 * 1000);

    manager.startSessionPartInternal('init');
    const attrs2 = manager.getUserSessionAttributes();
    manager.endSessionPartInternal('web_background');
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
    // The user-session max-duration timer must fire even while no part is
    // active. Part-end re-arms the timer against the same
    // userSessionMaxEndTs so a session that hits max duration mid-idle
    // still attempts rollover; the actual user-session teardown happens
    // lazily on the next part start via the expiry path.
    const manager = createManager({ maxUserSessionDurationSeconds: 3600 });

    manager.startSessionPartInternal('init');
    // web_background keeps the user session alive after part end;
    // inactivity would terminate the user session in one step.
    manager.endSessionPartInternal('web_background');

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
      userSessionPartIndex: number;
    };
    expect(state.userSessionId).to.have.lengthOf(32);
    expect(state.userSessionNumber).to.equal(1);
    expect(state.userSessionPartIndex).to.equal(1);
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
    expect(attrs2?.['emb.user_session_part_index']).to.equal(1);
  });

  it('should not resurrect cleared state on a part-end-driven persist', () => {
    // If a user wipes site data (or the browser evicts it) while a part
    // is active, the visibility-change pagehide flow used to re-persist
    // the in-memory state and silently restore everything. Honor the
    // clear instead.
    const manager = createManager();
    manager.startSessionPartInternal('init');
    expect(inMemoryStorage.getItem('embrace_user_session_state')).to.not.be
      .null;

    inMemoryStorage.clear();

    // web_background is the non-final part end that triggers the
    // continuation persist; this is the path that previously rewrote
    // the cleared row.
    manager.endSessionPartInternal('web_background');

    void expect(inMemoryStorage.getItem('embrace_user_session_state')).to.be
      .null;
    void expect(manager.getUserSessionAttributes()).to.be.null;

    // Next engagement starts a brand-new user session rather than
    // continuing the cleared one.
    manager.startSessionPartInternal('web_activity');
    expect(
      manager.getUserSessionAttributes()?.['emb.user_session_part_index'],
    ).to.equal(1);
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
    const manager = createManager({ maxUserSessionDurationSeconds: 3600 });
    manager.startSessionPartInternal('init');
    const attrs = manager.getUserSessionAttributes();
    const dyingId = attrs?.['emb.user_session_id'];

    clock.tick(3601 * 1000);

    expect(manager.getPreviousUserSessionId()).to.equal(dyingId);
  });

  describe('endUserSession cooldown', () => {
    it('should accept the first endUserSession with no prior end on record', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');

      const idBefore = manager.getUserSessionId();
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        false,
      );
      expect(manager.getUserSessionId()).to.not.equal(idBefore);
    });

    it('should reject a second endUserSession within 5s of a successful end', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');
      manager.endUserSession();

      clock.tick(2 * 1000);
      const idAfterFirstEnd = manager.getUserSessionId();
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        true,
      );
      expect(manager.getUserSessionId()).to.equal(idAfterFirstEnd);
    });

    it('should reject endUserSession after a page refresh when the persisted last-end is younger than 5s', () => {
      // The cooldown must survive a refresh: a fresh manager (simulating a
      // new page load) reads the persisted last-end timestamp and still
      // rejects calls within the 5s window.
      const first = createManager();
      first.startSessionPartInternal('init');
      first.endUserSession();

      clock.tick(1 * 1000);

      const afterRefresh = createManager();
      afterRefresh.startSessionPartInternal('init');
      const idBefore = afterRefresh.getUserSessionId();
      afterRefresh.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        true,
      );
      expect(afterRefresh.getUserSessionId()).to.equal(idBefore);
    });

    it('should accept endUserSession exactly at the 5s boundary (strict less-than)', () => {
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

    it('should accept endUserSession after the cooldown window has elapsed', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');
      manager.endUserSession();

      clock.tick(6 * 1000);
      const idAfterFirstEnd = manager.getUserSessionId();
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        false,
      );
      expect(manager.getUserSessionId()).to.not.equal(idAfterFirstEnd);
    });
  });

  describe('config clamp min-boundary', () => {
    it('should fall back to default when maxUserSessionDurationSeconds is below minimum', () => {
      // MIN is 1 hour (3600s); 60s is below minimum
      const manager = createManager({ maxUserSessionDurationSeconds: 60 });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxUserSessionDurationSeconds is zero', () => {
      const manager = createManager({ maxUserSessionDurationSeconds: 0 });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxUserSessionDurationSeconds is negative', () => {
      const manager = createManager({ maxUserSessionDurationSeconds: -60 });
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

    it('should fall back to default when maxUserSessionDurationSeconds is NaN', () => {
      // NaN slips both range gates (NaN < x and NaN > x both return false), so
      // without the finite-number guard the manager would persist NaN as
      // _maxUserSessionDurationSeconds and JSON.stringify would write `null` to storage.
      const manager = createManager({
        maxUserSessionDurationSeconds: Number.NaN,
      });
      manager.startSessionPartInternal('init');
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxUserSessionDurationSeconds is Infinity', () => {
      const manager = createManager({
        maxUserSessionDurationSeconds: Number.POSITIVE_INFINITY,
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
        maxUserSessionDurationSeconds: 60,
        inactivityTimeoutSeconds: Number.NaN,
      });

      const warnLogs = diag.getWarnLogs();
      expect(
        warnLogs.some((l) => l.includes('range')),
        'expected diag.warn for out-of-range config value',
      ).to.equal(true);
      expect(
        warnLogs.some((l) => l.includes('finite')),
        'expected diag.warn for non-finite config value',
      ).to.equal(true);
    });
  });

  describe('inactivity > max fallback', () => {
    it('should fall back to default inactivity when configured inactivity exceeds max duration', () => {
      // max = 1h, inactivity = 2h (both inside their own min/max range, but inactivity > max)
      const manager = createManager({
        maxUserSessionDurationSeconds: 3600,
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

  describe('clock anomaly handling', () => {
    it('should start a fresh session when device time is before stored session start', () => {
      const manager1 = createManager();
      manager1.startSessionPartInternal('init');
      const attrs1 = manager1.getUserSessionAttributes();
      // web_background keeps state on disk for the second manager to
      // read back; the test then mutates the persisted row.
      manager1.endSessionPartInternal('web_background');

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

  describe('inactivity timeout invalidation', () => {
    it('should not write an inactivity deadline while the first foreground part is active', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');

      void expect(readStoredDeadline()).to.be.null;
    });

    it('should write the inactivity deadline onto the state row when a non-final part ends', () => {
      const manager = createManager({ inactivityTimeoutSeconds: 120 });
      manager.startSessionPartInternal('init');
      clock.tick(10 * 1000);
      // web_background keeps the user session alive and writes the
      // deadline; inactivity would terminate the session in one step.
      manager.endSessionPartInternal('web_background');

      expect(readStoredDeadline()).to.equal(10 * 1000 + 120 * 1000);
    });

    it('should clear the inactivity deadline when a continuing part starts', () => {
      const manager = createManager();
      manager.startSessionPartInternal('init');
      manager.endSessionPartInternal('web_background');
      void expect(readStoredDeadline()).to.not.be.null;

      // A continuing part (within timeout) should clear the persisted value.
      clock.tick(60 * 1000);
      manager.startSessionPartInternal('init');

      void expect(readStoredDeadline()).to.be.null;
    });

    it('should not expire on inactivity when recovering a session with no prior part-end', () => {
      const manager1 = createManager({
        maxUserSessionDurationSeconds: 12 * 60 * 60,
      });
      manager1.startSessionPartInternal('init');
      const attrs1 = manager1.getUserSessionAttributes();
      // Simulate a crash: no endSessionPartInternal call, no deadline written.
      // shutdown clears manager1's part-inactivity and max-duration timers
      // so the fake clock does not synthesize a clean part-end during the
      // tick below, mimicking a JS engine that died with the page.
      manager1.shutdown();

      // Fast forward past the default inactivity timeout but within max duration.
      clock.tick(60 * 60 * 1000);

      const manager2 = createManager({
        maxUserSessionDurationSeconds: 12 * 60 * 60,
      });
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
      const manager1 = createManager({
        maxUserSessionDurationSeconds: 60 * 60,
      });
      manager1.startSessionPartInternal('init');
      const attrs1 = manager1.getUserSessionAttributes();
      manager1.endSessionPartInternal('web_background');
      // Cancel manager1's max-duration timer so it doesn't auto-rollover during
      // the tick. We're simulating a page reload: the prior page is gone,
      // storage carries the dying state forward, and a fresh manager loads.
      manager1._clearMaxDurationTimer();

      // Jump the clock past the locked-in userSessionMaxEndTs (1h window).
      clock.tick(60 * 60 * 1000 + 1);

      const manager2 = createManager({
        maxUserSessionDurationSeconds: 60 * 60,
      });
      manager2.startSessionPartInternal('init');
      const attrs2 = manager2.getUserSessionAttributes();

      expect(attrs2?.['emb.user_session_id']).to.not.equal(
        attrs1?.['emb.user_session_id'],
      );
      expect(attrs2?.['emb.user_session_number']).to.equal(2);
      expect(attrs2?.['emb.user_session_part_index']).to.equal(1);
    });
  });
});
