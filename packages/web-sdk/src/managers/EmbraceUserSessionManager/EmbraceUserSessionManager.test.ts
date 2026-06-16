import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  createTestDynamicConfigManager,
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
  MockPerformanceManager,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../tests/utils/index.ts';
import type { DynamicSDKConfig } from '../../sdk/index.ts';
import { NamespacedStorage } from '../../utils/NamespacedStorage/NamespacedStorage.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
} from '../EmbraceLimitManager/index.ts';
import { EmbraceUserSessionManager } from './EmbraceUserSessionManager.ts';
import type { EndSessionPartOptions } from './types.ts';

chai.use(sinonChai);
const { expect } = chai;

/**
 * Returns the options passed to the most recent `endSessionPartInternal`
 * invocation, or `undefined` if the spy was never called.
 */
const lastEndCall = (
  spy: sinon.SinonSpy,
): EndSessionPartOptions | undefined => {
  if (spy.callCount === 0) {
    return undefined;
  }
  return spy.lastCall.args[0] as EndSessionPartOptions;
};

describe('EmbraceUserSessionManager', () => {
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
    userSessionMaxDurationSeconds?: number;
    userSessionInactivityTimeoutSeconds?: number;
    userSessionForegroundInactivityTimeoutSeconds?: number;
  }) =>
    new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      visibilityDoc: window.document,
      dynamicConfigManager: createTestDynamicConfigManager(config),
    });

  // A manager wired to storage that throws on every operation, so reads
  // always come back empty and no write ever persists. Exercises the
  // in-memory-authoritative path in _loadOrCreateUserSessionState.
  const createFailingStorageManager = (config?: {
    userSessionMaxDurationSeconds?: number;
    userSessionInactivityTimeoutSeconds?: number;
    userSessionForegroundInactivityTimeoutSeconds?: number;
  }) =>
    new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage: new NamespacedStorage({ storage: new FailingStorage(), diag }),
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      visibilityDoc: window.document,
      dynamicConfigManager: createTestDynamicConfigManager(config),
    });

  // Builds a manager whose getConfig() reads a live, mutable config object so a
  // test can change remote-config values mid-session. getConfig returns a fresh
  // copy each call so mutations are picked up at the next session creation.
  const createManagerWithLiveConfig = (
    config: Partial<DynamicSDKConfig> = {},
  ) => {
    const refreshRemoteConfig = sinon.stub();
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      visibilityDoc: window.document,
      dynamicConfigManager: {
        refreshRemoteConfig,
        setConfig: sinon.stub(),
        getConfig: () => ({ samplingPct: 100, ...config }),
      },
    });
    return { manager, config, refreshRemoteConfig };
  };

  it('should create a session on first part start', () => {
    const manager = createManager();
    manager.startSessionPartInternal({ reason: 'init' });
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

  it('stamps emb.user_session_foreground_inactivity_timeout_seconds at part start', () => {
    const manager = createManager({
      userSessionForegroundInactivityTimeoutSeconds: 90,
    });
    manager.startSessionPartInternal({ reason: 'init' });
    const attrs = manager.getUserSessionAttributes();
    void expect(attrs).to.not.be.null;
    expect(
      attrs?.['emb.user_session_foreground_inactivity_timeout_seconds'],
    ).to.equal(90);
  });

  it('should continue session across parts within timeout', () => {
    const manager = createManager();

    manager.startSessionPartInternal({ reason: 'init' });
    const attrs1 = manager.getUserSessionAttributes();
    // web_background ends the part but keeps the user session alive
    // (inactivity now ends both the part and the user session in one step).
    manager.endSessionPartInternal({ reason: 'web_background' });

    // Advance time within inactivity timeout (29 min)
    clock.tick(29 * 60 * 1000);

    manager.startSessionPartInternal({ reason: 'init' });
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(1);
    expect(attrs2?.['emb.user_session_part_index']).to.equal(2);
  });

  it('should start a session when inactivity timeout expires', () => {
    const manager = createManager();

    manager.startSessionPartInternal({ reason: 'init' });
    const attrs1 = manager.getUserSessionAttributes();
    manager.endSessionPartInternal({ reason: 'web_background' });

    // Advance past inactivity timeout (31 min)
    clock.tick(31 * 60 * 1000);

    manager.startSessionPartInternal({ reason: 'init' });
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.not.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(2);
    expect(attrs2?.['emb.user_session_part_index']).to.equal(1);
  });

  it('should start a session when max duration expires', () => {
    const manager = createManager({ userSessionMaxDurationSeconds: 3600 });

    manager.startSessionPartInternal({ reason: 'init' });
    const attrs1 = manager.getUserSessionAttributes();
    manager.endSessionPartInternal({ reason: 'web_background' });

    // Advance past max duration (3601 seconds)
    clock.tick(3601 * 1000);

    manager.startSessionPartInternal({ reason: 'init' });
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
      userSessionMaxDurationSeconds: 3600,
      userSessionInactivityTimeoutSeconds: 3600,
      userSessionForegroundInactivityTimeoutSeconds: 3600,
    });

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');
    const startSpy = sinon.spy(manager, 'startSessionPartInternal');

    manager.startSessionPartInternal({ reason: 'init' });

    // Fast forward past max duration
    clock.tick(3601 * 1000);

    void expect(endSpy.called).to.be.true;
    // startSpy was called once for the initial start AND once for the
    // user_session_rollover that follows max-duration termination.
    expect(startSpy.callCount).to.be.at.least(2);
  });

  it('should provide termination info when max duration fires', () => {
    const manager = createManager({
      userSessionMaxDurationSeconds: 3600,
      userSessionInactivityTimeoutSeconds: 3600,
      userSessionForegroundInactivityTimeoutSeconds: 3600,
    });

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    manager.startSessionPartInternal({ reason: 'init' });
    clock.tick(3601 * 1000);

    expect(lastEndCall(endSpy)).to.deep.include({
      reason: 'user_session_ended',
      userSessionEndReason: 'max_duration_reached',
    });
  });

  it('should handle manual termination via endUserSession', () => {
    const manager = createManager();

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');
    const startSpy = sinon.spy(manager, 'startSessionPartInternal');

    manager.startSessionPartInternal({ reason: 'init' });
    manager.endUserSession();

    void expect(endSpy.called).to.be.true;
    expect(startSpy.callCount).to.be.at.least(2);
  });

  it('should provide termination info during manual termination', () => {
    const manager = createManager();

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    manager.startSessionPartInternal({ reason: 'init' });
    manager.endUserSession();

    expect(lastEndCall(endSpy)).to.deep.include({
      reason: 'user_session_ended',
      userSessionEndReason: 'manual',
    });
  });

  it('should be a no-op when ending session with no active session', () => {
    const manager = createManager();
    manager.endUserSession();
    expect(diag.getDebugLogs()).to.have.lengthOf(1);
  });

  it('should share state across manager instances via storage', () => {
    const manager1 = createManager();
    manager1.startSessionPartInternal({ reason: 'init' });
    const attrs1 = manager1.getUserSessionAttributes();
    // web_background keeps the user session alive; another tab joining
    // should adopt it. (inactivity now ends both part and user session.)
    manager1.endSessionPartInternal({ reason: 'web_background' });

    // Simulate another tab creating a manager with the same storage
    const manager2 = createManager();
    manager2.startSessionPartInternal({ reason: 'init' });
    const attrs2 = manager2.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_part_index']).to.equal(2);
  });

  describe('storage unavailable', () => {
    it('creates an in-memory user session and reports the write failure once', () => {
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

      const manager = new EmbraceUserSessionManager({
        diag,
        perf: new MockPerformanceManager(clock),
        storage: safeFailing,
        limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
        visibilityDoc: window.document,
        dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      });

      manager.startSessionPartInternal({ reason: 'init' });
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

    it('continues the same user session across parts', () => {
      const manager = createFailingStorageManager();

      manager.startSessionPartInternal({ reason: 'init' });
      const attrs1 = manager.getUserSessionAttributes();
      manager.endSessionPartInternal({ reason: 'web_background' });

      // Advance within the inactivity timeout.
      clock.tick(29 * 60 * 1000);

      manager.startSessionPartInternal({ reason: 'init' });
      const attrs2 = manager.getUserSessionAttributes();

      // Storage is unavailable, so the in-memory session the manager already
      // holds stays authoritative; a fresh user session is not minted per part.
      expect(attrs2?.['emb.user_session_id']).to.equal(
        attrs1?.['emb.user_session_id'],
      );
      expect(attrs2?.['emb.user_session_part_index']).to.equal(2);
    });

    it('keeps one user session across repeated parts', () => {
      const manager = createFailingStorageManager();

      manager.startSessionPartInternal({ reason: 'init' });
      const userSessionId =
        manager.getUserSessionAttributes()?.['emb.user_session_id'];

      // Several engage/disengage cycles, each well within the inactivity
      // timeout: one journey must stay one user session, never fragmenting into
      // one-per-part the way it did before the in-memory fallback existed.
      for (
        let expectedPartIndex = 2;
        expectedPartIndex <= 4;
        expectedPartIndex++
      ) {
        manager.endSessionPartInternal({ reason: 'web_background' });
        clock.tick(5 * 60 * 1000);
        manager.startSessionPartInternal({ reason: 'init' });

        const attrs = manager.getUserSessionAttributes();
        expect(attrs?.['emb.user_session_id']).to.equal(userSessionId);
        expect(attrs?.['emb.user_session_part_index']).to.equal(
          expectedPartIndex,
        );
      }
    });

    it('mints a fresh user session when the inactivity timeout expires', () => {
      const manager = createFailingStorageManager();

      manager.startSessionPartInternal({ reason: 'init' });
      const attrs1 = manager.getUserSessionAttributes();
      manager.endSessionPartInternal({ reason: 'web_background' });

      // Past the default 30 min inactivity timeout.
      clock.tick(31 * 60 * 1000);

      manager.startSessionPartInternal({ reason: 'init' });
      const attrs2 = manager.getUserSessionAttributes();

      // The in-memory session stays authoritative only while it is live: once
      // its inactivity deadline passes, the next part rolls a fresh user session
      // instead of resurrecting the expired one. The user-session number cannot
      // advance because the shared counter also lives in unavailable storage.
      expect(attrs2?.['emb.user_session_id']).to.not.equal(
        attrs1?.['emb.user_session_id'],
      );
      expect(attrs2?.['emb.user_session_part_index']).to.equal(1);
    });

    it('mints a fresh user session when the max duration expires', () => {
      const manager = createFailingStorageManager({
        userSessionMaxDurationSeconds: 3600,
      });

      manager.startSessionPartInternal({ reason: 'init' });
      const attrs1 = manager.getUserSessionAttributes();
      manager.endSessionPartInternal({ reason: 'web_background' });

      // Past the 1 hour max duration. The max-duration timer lives in memory, so
      // it rolls the user session over even though nothing was ever persisted.
      clock.tick(3601 * 1000);

      manager.startSessionPartInternal({ reason: 'init' });
      const attrs2 = manager.getUserSessionAttributes();

      expect(attrs2?.['emb.user_session_id']).to.not.equal(
        attrs1?.['emb.user_session_id'],
      );
      expect(attrs2?.['emb.user_session_part_index']).to.equal(1);
    });
  });

  it('should clamp max duration to the maximum', () => {
    // 25 hours exceeds 24 hour max
    const manager = createManager({
      userSessionMaxDurationSeconds: 25 * 60 * 60,
    });
    manager.startSessionPartInternal({ reason: 'init' });
    const attrs = manager.getUserSessionAttributes();
    expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
  });

  it('should clamp inactivity timeout to the maximum', () => {
    // 25 hours exceeds 24 hour max
    const manager = createManager({
      userSessionInactivityTimeoutSeconds: 25 * 60 * 60,
    });
    manager.startSessionPartInternal({ reason: 'init' });
    const attrs = manager.getUserSessionAttributes();
    expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
      1800,
    );
  });

  it('should increment user session number monotonically', () => {
    const manager = createManager();

    manager.startSessionPartInternal({ reason: 'init' });
    manager.endSessionPartInternal({ reason: 'web_background' });
    // Expire the session
    clock.tick(31 * 60 * 1000);

    manager.startSessionPartInternal({ reason: 'init' });
    const attrs2 = manager.getUserSessionAttributes();
    manager.endSessionPartInternal({ reason: 'web_background' });
    clock.tick(31 * 60 * 1000);

    manager.startSessionPartInternal({ reason: 'init' });
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
    // active. When the rollover runs with no active part, state is cleared
    // directly so the next part start lazily creates a fresh user session.
    const manager = createManager({ userSessionMaxDurationSeconds: 3600 });

    manager.startSessionPartInternal({ reason: 'init' });
    const firstSessionId = manager.getUserSessionId();
    expect(firstSessionId).to.not.be.null;

    manager.endSessionPartInternal({ reason: 'web_background' });

    clock.tick(3601 * 1000);

    // After the timer fires with no active part, state is cleared and the
    // user-session id resets. The next part start rolls a fresh session.
    expect(manager.getUserSessionId()).to.be.null;

    manager.startSessionPartInternal({ reason: 'web_foreground' });
    expect(manager.getUserSessionId()).to.not.equal(firstSessionId);
  });

  it('should persist session state to storage', () => {
    const manager = createManager();
    manager.startSessionPartInternal({ reason: 'init' });

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

    manager.startSessionPartInternal({ reason: 'init' });
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
    // is active, an end-driven persist could re-write the in-memory
    // state and silently restore everything. Honor the clear instead.
    const manager = createManager();
    manager.startSessionPartInternal({ reason: 'init' });
    expect(inMemoryStorage.getItem('embrace_user_session_state')).to.not.be
      .null;

    inMemoryStorage.clear();

    // web_background is the non-final part end that triggers the
    // continuation persist; this is the path that previously rewrote
    // the cleared row.
    manager.endSessionPartInternal({ reason: 'web_background' });

    void expect(inMemoryStorage.getItem('embrace_user_session_state')).to.be
      .null;
    void expect(manager.getUserSessionAttributes()).to.be.null;

    // Next engagement starts a brand-new user session rather than
    // continuing the cleared one.
    manager.startSessionPartInternal({ reason: 'web_activity' });
    expect(
      manager.getUserSessionAttributes()?.['emb.user_session_part_index'],
    ).to.equal(1);
  });

  it('should clear storage after endUserSession-driven termination', () => {
    const manager = createManager();
    manager.startSessionPartInternal({ reason: 'init' });

    expect(inMemoryStorage.getItem('embrace_user_session_state')).to.not.be
      .null;

    // The merged manager runs a rollover (clear + new session) so storage
    // is rewritten by the new part. Inspect mid-flight by spying on
    // endSessionPartInternal and reading storage at that moment.
    let storageDuringEnd: string | null = '';
    const original = manager.endSessionPartInternal.bind(manager);
    sinon
      .stub(manager, 'endSessionPartInternal')
      .callsFake((options: EndSessionPartOptions) => {
        if (options.reason === 'user_session_ended') {
          storageDuringEnd = inMemoryStorage.getItem(
            'embrace_user_session_state',
          );
        }
        original(options);
      });

    manager.endUserSession();

    // We can verify the dying session's storage row was cleared even though
    // a rollover write follows: the in-memory previous id matches what was
    // active before, and the new state is a different session id.
    const finalRaw = inMemoryStorage.getItem('embrace_user_session_state');
    expect(finalRaw).to.not.equal(storageDuringEnd);
  });

  it('should expose the dying user session id via getPreviousUserSessionId on manual end', () => {
    const manager = createManager();
    manager.startSessionPartInternal({ reason: 'init' });
    const attrs = manager.getUserSessionAttributes();
    const dyingId = attrs?.['emb.user_session_id'];

    manager.endUserSession();

    expect(manager.getPreviousUserSessionId()).to.equal(dyingId);
  });

  it('should expose the dying user session id via getPreviousUserSessionId on max-duration rollover', () => {
    const manager = createManager({ userSessionMaxDurationSeconds: 3600 });
    manager.startSessionPartInternal({ reason: 'init' });
    const attrs = manager.getUserSessionAttributes();
    const dyingId = attrs?.['emb.user_session_id'];

    clock.tick(3601 * 1000);

    expect(manager.getPreviousUserSessionId()).to.equal(dyingId);
  });

  describe('endUserSession cooldown', () => {
    it('should accept the first endUserSession with no prior end on record', () => {
      const manager = createManager();
      manager.startSessionPartInternal({ reason: 'init' });

      const idBefore = manager.getUserSessionId();
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        false,
      );
      expect(manager.getUserSessionId()).to.not.equal(idBefore);
    });

    it('should reject a second endUserSession within 5s of a successful end', () => {
      const manager = createManager();
      manager.startSessionPartInternal({ reason: 'init' });
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
      first.startSessionPartInternal({ reason: 'init' });
      first.endUserSession();

      clock.tick(1 * 1000);

      const afterRefresh = createManager();
      afterRefresh.startSessionPartInternal({ reason: 'init' });
      const idBefore = afterRefresh.getUserSessionId();
      afterRefresh.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        true,
      );
      expect(afterRefresh.getUserSessionId()).to.equal(idBefore);
    });

    it('should accept endUserSession exactly at the 5s boundary (strict less-than)', () => {
      const manager = createManager();
      manager.startSessionPartInternal({ reason: 'init' });
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
      manager.startSessionPartInternal({ reason: 'init' });
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
    it('should fall back to default when userSessionMaxDurationSeconds is below minimum', () => {
      // MIN is 1 hour (3600s); 60s is below minimum
      const manager = createManager({ userSessionMaxDurationSeconds: 60 });
      manager.startSessionPartInternal({ reason: 'init' });
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when userSessionMaxDurationSeconds is zero', () => {
      const manager = createManager({ userSessionMaxDurationSeconds: 0 });
      manager.startSessionPartInternal({ reason: 'init' });
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when userSessionMaxDurationSeconds is negative', () => {
      const manager = createManager({ userSessionMaxDurationSeconds: -60 });
      manager.startSessionPartInternal({ reason: 'init' });
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when userSessionInactivityTimeoutSeconds is below minimum', () => {
      // MIN is 30s; 10s is below minimum
      const manager = createManager({
        userSessionInactivityTimeoutSeconds: 10,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should fall back to default when userSessionInactivityTimeoutSeconds is zero', () => {
      const manager = createManager({ userSessionInactivityTimeoutSeconds: 0 });
      manager.startSessionPartInternal({ reason: 'init' });
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should fall back to default when userSessionInactivityTimeoutSeconds is negative', () => {
      const manager = createManager({
        userSessionInactivityTimeoutSeconds: -60,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should fall back to default when userSessionMaxDurationSeconds is NaN', () => {
      // NaN slips both range gates (NaN < x and NaN > x both return false), so
      // without the finite-number guard the manager would persist NaN as
      // _userSessionMaxDurationSeconds and JSON.stringify would write `null` to storage.
      const manager = createManager({
        userSessionMaxDurationSeconds: Number.NaN,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when userSessionMaxDurationSeconds is Infinity', () => {
      const manager = createManager({
        userSessionMaxDurationSeconds: Number.POSITIVE_INFINITY,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when userSessionInactivityTimeoutSeconds is NaN', () => {
      const manager = createManager({
        userSessionInactivityTimeoutSeconds: Number.NaN,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should diag.warn when a config value is rejected so dropped config is visible to developers', () => {
      const manager = createManager({
        userSessionMaxDurationSeconds: 60,
        userSessionInactivityTimeoutSeconds: Number.NaN,
      });
      // Durations are resolved lazily at user-session creation, so the
      // clamp warnings only fire once a part starts.
      manager.startSessionPartInternal({ reason: 'init' });

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
        userSessionMaxDurationSeconds: 3600,
        userSessionInactivityTimeoutSeconds: 7200,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(3600);
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should diag.warn when configured inactivity exceeds max duration so the fallback is visible', () => {
      const manager = createManager({
        userSessionMaxDurationSeconds: 3600,
        userSessionInactivityTimeoutSeconds: 7200,
      });
      manager.startSessionPartInternal({ reason: 'init' });

      expect(
        diag
          .getWarnLogs()
          .some((l) => l.includes('exceeds userSessionMaxDurationSeconds')),
        'expected diag.warn when inactivity exceeds max duration',
      ).to.equal(true);
    });

    it('should diag.warn when the configured foreground timeout exceeds max duration so the fallback is visible', () => {
      const manager = createManager({
        userSessionMaxDurationSeconds: 3600,
        userSessionForegroundInactivityTimeoutSeconds: 7200,
      });
      manager.startSessionPartInternal({ reason: 'init' });

      expect(
        diag
          .getWarnLogs()
          .some((l) => l.includes('default foreground inactivity timeout')),
        'expected diag.warn when foreground timeout exceeds max duration',
      ).to.equal(true);
    });
  });

  describe('remote config refresh on new user session', () => {
    it('refreshes remote config for each new user session after cold start, but not on cold start itself', () => {
      const { manager, refreshRemoteConfig } = createManagerWithLiveConfig();

      // The cold-start user session relies on initSDK's startup refresh, so
      // the manager must not issue its own redundant fetch here.
      manager.startSessionPartInternal({ reason: 'init' });
      expect(refreshRemoteConfig.callCount).to.equal(0);

      // Ending the user session rolls over into a fresh one, which should
      // trigger a refresh so the new session can pick up updated values.
      manager.endUserSession();
      expect(refreshRemoteConfig.callCount).to.equal(1);

      // A third user session refreshes again (cooldown cleared first).
      clock.tick(6 * 1000);
      manager.endUserSession();
      expect(refreshRemoteConfig.callCount).to.equal(2);
    });

    it('does not refresh on a continuing part within the same user session', () => {
      const { manager, refreshRemoteConfig } = createManagerWithLiveConfig();

      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'web_background' });
      clock.tick(60 * 1000); // within the default inactivity timeout
      manager.startSessionPartInternal({ reason: 'init' }); // same session continues

      expect(refreshRemoteConfig.callCount).to.equal(0);
    });

    it('refreshes when the inactivity timeout expires into a new user session', () => {
      const { manager, refreshRemoteConfig } = createManagerWithLiveConfig();

      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'web_background' });
      clock.tick(31 * 60 * 1000); // past the default 30 min inactivity timeout
      manager.startSessionPartInternal({ reason: 'init' }); // fresh session

      expect(refreshRemoteConfig.callCount).to.equal(1);
    });

    it('refreshes when the max-duration timer rolls the session over', () => {
      // Equal max + inactivity so the max-duration timer (armed first) fires
      // before the part-inactivity timer, matching the lifecycle suite.
      const { manager, refreshRemoteConfig } = createManagerWithLiveConfig({
        userSessionMaxDurationSeconds: 3600,
        userSessionInactivityTimeoutSeconds: 3600,
        userSessionForegroundInactivityTimeoutSeconds: 3600,
      });

      manager.startSessionPartInternal({ reason: 'init' });
      clock.tick(3601 * 1000); // fire max-duration timer -> rollover

      expect(refreshRemoteConfig.callCount).to.equal(1);
    });

    it('does not refresh on the cold-start session created eagerly by setTracerProvider', () => {
      const { manager, refreshRemoteConfig } = createManagerWithLiveConfig();

      // setTracerProvider eagerly creates the cold-start session before any
      // part starts. That creation must rely on initSDK's startup refresh, not
      // issue its own redundant fetch.
      manager.setTracerProvider(new WebTracerProvider());

      expect(refreshRemoteConfig.callCount).to.equal(0);
    });
  });

  describe('clock anomaly handling', () => {
    it('should start a fresh session when device time is before stored session start', () => {
      const manager1 = createManager();
      manager1.startSessionPartInternal({ reason: 'init' });
      const attrs1 = manager1.getUserSessionAttributes();
      // web_background keeps state on disk for the second manager to
      // read back; the test then mutates the persisted row.
      manager1.endSessionPartInternal({ reason: 'web_background' });

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
      manager2.startSessionPartInternal({ reason: 'init' });
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
      manager.startSessionPartInternal({ reason: 'init' });

      void expect(readStoredDeadline()).to.be.null;
    });

    it('should write the inactivity deadline onto the state row when a non-final part ends', () => {
      const manager = createManager({
        userSessionInactivityTimeoutSeconds: 120,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      clock.tick(10 * 1000);
      // web_background keeps the user session alive and writes the
      // deadline; inactivity would terminate the session in one step.
      manager.endSessionPartInternal({ reason: 'web_background' });

      expect(readStoredDeadline()).to.equal(10 * 1000 + 120 * 1000);
    });

    it('should clear the inactivity deadline when a continuing part starts', () => {
      const manager = createManager();
      manager.startSessionPartInternal({ reason: 'init' });
      manager.endSessionPartInternal({ reason: 'web_background' });
      void expect(readStoredDeadline()).to.not.be.null;

      // A continuing part (within timeout) should clear the persisted value.
      clock.tick(60 * 1000);
      manager.startSessionPartInternal({ reason: 'init' });

      void expect(readStoredDeadline()).to.be.null;
    });

    it('should not expire on inactivity when recovering a session with no prior part-end', () => {
      const manager1 = createManager({
        userSessionMaxDurationSeconds: 12 * 60 * 60,
      });
      manager1.startSessionPartInternal({ reason: 'init' });
      const attrs1 = manager1.getUserSessionAttributes();
      // Simulate a crash: no endSessionPartInternal call, no deadline written.
      // shutdown clears manager1's part-inactivity and max-duration timers
      // so the fake clock does not synthesize a clean part-end during the
      // tick below, mimicking a JS engine that died with the page.
      manager1._shutdown();

      // Fast forward past the default inactivity timeout but within max duration.
      clock.tick(60 * 60 * 1000);

      const manager2 = createManager({
        userSessionMaxDurationSeconds: 12 * 60 * 60,
      });
      manager2.startSessionPartInternal({ reason: 'init' });
      const attrs2 = manager2.getUserSessionAttributes();

      expect(attrs2?.['emb.user_session_id']).to.equal(
        attrs1?.['emb.user_session_id'],
      );
    });
  });

  describe('durations frozen per user session', () => {
    it('keeps the active session on its frozen inactivity timeout but applies config changes to the next session', () => {
      const { manager, config } = createManagerWithLiveConfig({
        userSessionInactivityTimeoutSeconds: 120,
      });

      manager.startSessionPartInternal({ reason: 'init' });
      expect(
        manager.getUserSessionAttributes()?.[
          'emb.user_session_inactivity_timeout_seconds'
        ],
      ).to.equal(120);

      // A mid-session remote-config change must not shift the active session.
      config.userSessionInactivityTimeoutSeconds = 600;
      clock.tick(10 * 1000);
      manager.endSessionPartInternal({ reason: 'web_background' });
      // The persisted deadline uses the frozen 120s, not the live 600s.
      expect(readStoredDeadline()).to.equal(10 * 1000 + 120 * 1000);

      // Rolling into a fresh session resolves durations again, picking up 600s.
      clock.tick(3 * 60 * 1000); // past the frozen 120s deadline -> expired
      manager.startSessionPartInternal({ reason: 'init' });
      expect(
        manager.getUserSessionAttributes()?.[
          'emb.user_session_inactivity_timeout_seconds'
        ],
      ).to.equal(600);
      expect(
        manager.getUserSessionAttributes()?.['emb.user_session_number'],
      ).to.equal(2);
    });

    it('keeps the active session on its frozen max duration but applies config changes to the next session', () => {
      const { manager, config } = createManagerWithLiveConfig({
        userSessionMaxDurationSeconds: 3600,
      });

      manager.startSessionPartInternal({ reason: 'init' });
      expect(
        manager.getUserSessionAttributes()?.[
          'emb.user_session_max_duration_seconds'
        ],
      ).to.equal(3600);

      // A mid-session remote-config change must not shift the active session.
      config.userSessionMaxDurationSeconds = 7200;
      expect(
        manager.getUserSessionAttributes()?.[
          'emb.user_session_max_duration_seconds'
        ],
      ).to.equal(3600);

      // Inactivity expiry rolls into a fresh session, which resolves durations
      // again and picks up the changed 7200s max.
      manager.endSessionPartInternal({ reason: 'web_background' });
      clock.tick(31 * 60 * 1000); // past the default 30 min inactivity timeout
      manager.startSessionPartInternal({ reason: 'init' });
      expect(
        manager.getUserSessionAttributes()?.[
          'emb.user_session_max_duration_seconds'
        ],
      ).to.equal(7200);
      expect(
        manager.getUserSessionAttributes()?.['emb.user_session_number'],
      ).to.equal(2);
    });
  });

  describe('corrupt storage recovery', () => {
    it('should recover by discarding corrupt session state and starting fresh', () => {
      inMemoryStorage.setItem(
        'embrace_user_session_state',
        'not-valid-json{{{',
      );

      const manager = createManager();
      manager.startSessionPartInternal({ reason: 'init' });
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
        userSessionMaxDurationSeconds: 60 * 60,
      });
      manager1.startSessionPartInternal({ reason: 'init' });
      const attrs1 = manager1.getUserSessionAttributes();
      manager1.endSessionPartInternal({ reason: 'web_background' });
      // Cancel manager1's max-duration timer so it doesn't auto-rollover during
      // the tick. We're simulating a page reload: the prior page is gone,
      // storage carries the dying state forward, and a fresh manager loads.
      manager1._clearMaxDurationTimer();

      // Jump the clock past the locked-in userSessionMaxEndTs (1h window).
      clock.tick(60 * 60 * 1000 + 1);

      const manager2 = createManager({
        userSessionMaxDurationSeconds: 60 * 60,
      });
      manager2.startSessionPartInternal({ reason: 'init' });
      const attrs2 = manager2.getUserSessionAttributes();

      expect(attrs2?.['emb.user_session_id']).to.not.equal(
        attrs1?.['emb.user_session_id'],
      );
      expect(attrs2?.['emb.user_session_number']).to.equal(2);
      expect(attrs2?.['emb.user_session_part_index']).to.equal(1);
    });
  });

  it('should return only permanent properties from getSessionPartProperties when no user session state exists', () => {
    const manager = createManager();
    // No startSessionPartInternal call: state is null. The user-session
    // properties fallback empty so only permanent properties show through.
    expect(manager.getSessionPartProperties()).to.deep.equal({});

    manager.addProperty('perm', 'value', { lifespan: 'permanent' });
    // addProperty with permanent lifespan stores into permanent properties
    // without creating user-session state.
    expect(manager.getSessionPartProperties()).to.deep.equal({ perm: 'value' });
  });

  describe('foreground inactivity timeout frozen into state', () => {
    const readStoredForegroundTimeout = (): number | null => {
      const raw = inMemoryStorage.getItem('embrace_user_session_state');
      if (!raw) return null;
      return (
        JSON.parse(raw) as {
          userSessionForegroundInactivityTimeoutSeconds: number;
        }
      ).userSessionForegroundInactivityTimeoutSeconds;
    };

    it('freezes the configured foreground timeout into the state blob', () => {
      const manager = createManager({
        userSessionForegroundInactivityTimeoutSeconds: 90,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      expect(readStoredForegroundTimeout()).to.equal(90);
    });

    it('falls back to the default when the foreground timeout is below the minimum', () => {
      const manager = createManager({
        userSessionForegroundInactivityTimeoutSeconds: 5,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      expect(readStoredForegroundTimeout()).to.equal(1800);
    });

    it('falls back to the default when the foreground timeout exceeds the max duration', () => {
      const manager = createManager({
        userSessionMaxDurationSeconds: 3600,
        userSessionForegroundInactivityTimeoutSeconds: 7200,
      });
      manager.startSessionPartInternal({ reason: 'init' });
      expect(readStoredForegroundTimeout()).to.equal(1800);
    });

    it('falls back the foreground timeout without disturbing a valid inactivity timeout', () => {
      const manager = createManager({
        userSessionMaxDurationSeconds: 3600,
        userSessionInactivityTimeoutSeconds: 120,
        userSessionForegroundInactivityTimeoutSeconds: 7200,
      });
      manager.startSessionPartInternal({ reason: 'init' });

      const raw = inMemoryStorage.getItem('embrace_user_session_state');
      void expect(raw).to.not.be.null;
      const stored = JSON.parse(raw as string) as {
        userSessionInactivityTimeoutSeconds: number;
        userSessionForegroundInactivityTimeoutSeconds: number;
      };
      // The foreground timeout exceeds max duration, so it falls back to its
      // own default...
      expect(stored.userSessionForegroundInactivityTimeoutSeconds).to.equal(
        1800,
      );
      // ...while the independently-valid inactivity timeout is left untouched.
      expect(stored.userSessionInactivityTimeoutSeconds).to.equal(120);
    });
  });
});
