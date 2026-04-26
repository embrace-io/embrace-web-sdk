import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  InMemoryDiagLogger,
  InMemoryStorage,
  MockPerformanceManager,
} from '../../../tests/utils/index.ts';
import { NamespacedStorage } from '../../utils/NamespacedStorage/NamespacedStorage.ts';
import { EmbraceUserSessionManager } from './EmbraceUserSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbraceUserSessionManager', () => {
  let storage: InMemoryStorage;
  let diag: InMemoryDiagLogger;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    storage = new InMemoryStorage();
    diag = new InMemoryDiagLogger();
    clock = sinon.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    clock.restore();
  });

  const createManager = (config?: {
    maxDurationSeconds?: number;
    inactivityTimeoutSeconds?: number;
  }) =>
    new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      config,
    });

  it('should create a session on first part start', () => {
    const manager = createManager();
    const attrs = manager.onSessionPartStart();

    expect(attrs['emb.user_session_id']).to.have.lengthOf(32);
    expect(attrs['session.id']).to.equal(attrs['emb.user_session_id']);
    expect(attrs['emb.user_session_number']).to.equal(1);
    expect(attrs['emb.user_session_part_number']).to.equal(1);
    expect(attrs['emb.user_session_start_ts']).to.be.a('number');
    expect(attrs['emb.user_session_max_duration_seconds']).to.equal(43200);
    expect(attrs['emb.user_session_inactivity_timeout_seconds']).to.equal(1800);
  });

  it('should continue session across parts within timeout', () => {
    const manager = createManager();

    const attrs1 = manager.onSessionPartStart();
    manager.onSessionPartEnd();

    // Advance time within inactivity timeout (29 min)
    clock.tick(29 * 60 * 1000);

    const attrs2 = manager.onSessionPartStart();

    expect(attrs2['emb.user_session_id']).to.equal(
      attrs1['emb.user_session_id'],
    );
    expect(attrs2['emb.user_session_number']).to.equal(1);
    expect(attrs2['emb.user_session_part_number']).to.equal(2);
  });

  it('should start a session when inactivity timeout expires', () => {
    const manager = createManager();

    const attrs1 = manager.onSessionPartStart();
    manager.onSessionPartEnd();

    // Advance past inactivity timeout (31 min)
    clock.tick(31 * 60 * 1000);

    const attrs2 = manager.onSessionPartStart();

    expect(attrs2['emb.user_session_id']).to.not.equal(
      attrs1['emb.user_session_id'],
    );
    expect(attrs2['emb.user_session_number']).to.equal(2);
    expect(attrs2['emb.user_session_part_number']).to.equal(1);
  });

  it('should start a session when max duration expires', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });

    const attrs1 = manager.onSessionPartStart();
    manager.onSessionPartEnd();

    // Advance past max duration (3601 seconds)
    clock.tick(3601 * 1000);

    const attrs2 = manager.onSessionPartStart();

    expect(attrs2['emb.user_session_id']).to.not.equal(
      attrs1['emb.user_session_id'],
    );
    expect(attrs2['emb.user_session_number']).to.equal(2);
  });

  it('should fire max duration timer mid-part', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });

    const endSessionPartSpy = sinon.spy();
    const startSessionPartSpy = sinon.spy();
    manager.setSessionPartCallbacks({
      endSessionPart: endSessionPartSpy,
      startSessionPart: startSessionPartSpy,
    });

    manager.onSessionPartStart();

    // Fast forward past max duration
    clock.tick(3601 * 1000);

    expect(endSessionPartSpy).to.have.been.calledOnce;
    expect(startSessionPartSpy).to.have.been.calledOnce;
  });

  it('should provide termination info when max duration fires', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });

    let capturedInfo: { isFinal: boolean; reason: string | null } | null = null;
    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        capturedInfo = manager.getTerminationInfo();
      },
      startSessionPart: () => {
        // no-op
      },
    });

    manager.onSessionPartStart();
    clock.tick(3601 * 1000);

    expect(capturedInfo).to.deep.equal({
      isFinal: true,
      reason: 'max_duration_reached',
    });
  });

  it('should handle manual termination via endUserSession', () => {
    const manager = createManager();

    const endSessionPartSpy = sinon.spy();
    const startSessionPartSpy = sinon.spy();
    manager.setSessionPartCallbacks({
      endSessionPart: endSessionPartSpy,
      startSessionPart: startSessionPartSpy,
    });

    manager.onSessionPartStart();
    manager.endUserSession();

    expect(endSessionPartSpy).to.have.been.calledOnce;
    expect(startSessionPartSpy).to.have.been.calledOnce;
  });

  it('should provide termination info during manual termination', () => {
    const manager = createManager();

    let capturedInfo: { isFinal: boolean; reason: string | null } | null = null;
    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        capturedInfo = manager.getTerminationInfo();
      },
      startSessionPart: () => {
        // no-op
      },
    });

    manager.onSessionPartStart();
    manager.endUserSession();

    expect(capturedInfo).to.deep.equal({
      isFinal: true,
      reason: 'manual',
    });
  });

  it('should be a no-op when ending session with no active session', () => {
    const manager = createManager();
    manager.endUserSession();
    expect(diag.getDebugLogs()).to.have.lengthOf(1);
  });

  it('should share state across manager instances via storage', () => {
    const manager1 = createManager();
    const attrs1 = manager1.onSessionPartStart();
    manager1.onSessionPartEnd();

    // Simulate another tab creating a manager with the same storage
    const manager2 = createManager();
    const attrs2 = manager2.onSessionPartStart();

    expect(attrs2['emb.user_session_id']).to.equal(
      attrs1['emb.user_session_id'],
    );
    expect(attrs2['emb.user_session_part_number']).to.equal(2);
  });

  it('should not clobber another tab part-number bump when ending its own part', () => {
    // Tab A starts its first part: partNumber=1.
    const managerA = createManager();
    managerA.onSessionPartStart();

    // Tab B starts a part concurrently: reads A's state from storage,
    // increments to 2, writes it back. Tab A's in-memory _state is still 1.
    const managerB = createManager();
    const attrsB = managerB.onSessionPartStart();
    expect(attrsB['emb.user_session_part_number']).to.equal(2);

    // Tab A's part now ends (e.g., pagehide on hard refresh). The write-back
    // must not overwrite B's partNumber=2 with A's stale 1.
    managerA.onSessionPartEnd();

    // Tab A reloads and starts a fresh part: should see 2 in storage and
    // increment to 3.
    const managerAReloaded = createManager();
    const attrsA2 = managerAReloaded.onSessionPartStart();
    expect(attrsA2['emb.user_session_part_number']).to.equal(3);
  });

  it('should not clobber another tab part-number bump when starting its own part', () => {
    // Two tabs both observe partNumber=1 in storage and call onSessionPartStart
    // back-to-back: the second start must see the first's bump and continue
    // from there rather than rewriting the same number.
    const managerA = createManager();
    managerA.onSessionPartStart();

    const managerB = createManager();
    const attrsB = managerB.onSessionPartStart();
    expect(attrsB['emb.user_session_part_number']).to.equal(2);

    // Tab A starts its next part. Its in-memory _state still says 1, but
    // storage now says 2. The re-read in onSessionPartStart must adopt the
    // newer storage value, then increment to 3.
    const attrsA = managerA.onSessionPartStart();
    expect(attrsA['emb.user_session_part_number']).to.equal(3);
  });

  it('should clear in-memory state and end the active part when another tab clears storage', () => {
    const storageEventTarget = new EventTarget();
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      storageEventTarget,
    });

    manager.onSessionPartStart();
    expect(manager.getUserSessionId()).to.not.equal(null);

    let endPartCallbackInvocations = 0;
    let userSessionEndedInvocations = 0;
    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        endPartCallbackInvocations++;
      },
      startSessionPart: () => {},
    });
    manager.addUserSessionEndedListener(() => {
      userSessionEndedInvocations++;
    });

    // Simulate another tab calling endUserSession: storage key removed, then
    // a storage event fires on this tab.
    storage.removeItem('embrace_user_session_state');
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'embrace_user_session_state',
        newValue: null,
      }),
    );

    expect(manager.getUserSessionId()).to.equal(null);
    expect(endPartCallbackInvocations).to.equal(1);
    expect(userSessionEndedInvocations).to.equal(1);
  });

  it('should sync in-memory state when another tab updates the same session', () => {
    const storageEventTarget = new EventTarget();
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      storageEventTarget,
    });

    const attrs1 = manager.onSessionPartStart();
    const sessionId = attrs1['emb.user_session_id'];
    manager.onSessionPartEnd();

    let endPartInvocations = 0;
    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        endPartInvocations++;
      },
      startSessionPart: () => {},
    });

    // Another tab bumps partNumber while keeping the same session id.
    const otherTab = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
    });
    otherTab.onSessionPartStart();
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'embrace_user_session_state',
        newValue: storage.getItem('embrace_user_session_state'),
      }),
    );

    // Same session id, just synced; should not have ended any part.
    expect(manager.getUserSessionId()).to.equal(sessionId);
    expect(endPartInvocations).to.equal(0);
  });

  it('should ignore storage events for unrelated keys', () => {
    const storageEventTarget = new EventTarget();
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      storageEventTarget,
    });

    manager.onSessionPartStart();
    const sessionId = manager.getUserSessionId();

    let endPartInvocations = 0;
    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        endPartInvocations++;
      },
      startSessionPart: () => {},
    });

    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'something-unrelated',
        newValue: null,
      }),
    );

    expect(manager.getUserSessionId()).to.equal(sessionId);
    expect(endPartInvocations).to.equal(0);
  });

  it('should match namespaced storage events when wrapped in NamespacedStorage', () => {
    const storageEventTarget = new EventTarget();
    const namespaced = new NamespacedStorage('app123', storage);
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage: namespaced,
      storageEventTarget,
    });

    manager.onSessionPartStart();
    expect(manager.getUserSessionId()).to.not.equal(null);

    let endPartInvocations = 0;
    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        endPartInvocations++;
      },
      startSessionPart: () => {},
    });

    // Browser fires storage events with the underlying (namespaced) key, not
    // the logical key. The manager must compare against the namespaced form
    // to detect cross-tab clears under registerGlobally:false.
    namespaced.removeItem('embrace_user_session_state');
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'app123_embrace_user_session_state',
        newValue: null,
      }),
    );

    expect(manager.getUserSessionId()).to.equal(null);
    expect(endPartInvocations).to.equal(1);
  });

  it('should ignore literal-key storage events when running namespaced', () => {
    const storageEventTarget = new EventTarget();
    const namespaced = new NamespacedStorage('app123', storage);
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage: namespaced,
      storageEventTarget,
    });

    manager.onSessionPartStart();
    const sessionId = manager.getUserSessionId();

    let endPartInvocations = 0;
    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        endPartInvocations++;
      },
      startSessionPart: () => {},
    });

    // Another SDK instance on the same page (registerGlobally:true) writing
    // to the un-namespaced key must not be mistaken for our namespaced state.
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'embrace_user_session_state',
        newValue: null,
      }),
    );

    expect(manager.getUserSessionId()).to.equal(sessionId);
    expect(endPartInvocations).to.equal(0);
  });

  it('should remove the storage listener on dispose', () => {
    const storageEventTarget = new EventTarget();
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      storageEventTarget,
    });

    manager.onSessionPartStart();
    manager.dispose();

    let endPartInvocations = 0;
    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        endPartInvocations++;
      },
      startSessionPart: () => {},
    });

    // Storage event should be ignored after dispose.
    storage.removeItem('embrace_user_session_state');
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'embrace_user_session_state',
        newValue: null,
      }),
    );

    // Listener removed; in-memory state untouched, callback never invoked.
    expect(manager.getUserSessionId()).to.not.equal(null);
    expect(endPartInvocations).to.equal(0);
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

    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage: failingStorage,
    });

    const attrs = manager.onSessionPartStart();
    expect(attrs['emb.user_session_id']).to.have.lengthOf(32);
    // getIncrementedCount returns 0 as a sentinel when storage is unavailable
    // (vs 1 for a genuine first session).
    expect(attrs['emb.user_session_number']).to.equal(0);
  });

  it('should clamp max duration to the maximum', () => {
    // 25 hours exceeds 24 hour max
    const manager = createManager({ maxDurationSeconds: 25 * 60 * 60 });
    const attrs = manager.onSessionPartStart();
    expect(attrs['emb.user_session_max_duration_seconds']).to.equal(43200);
  });

  it('should clamp inactivity timeout to the maximum', () => {
    // 25 hours exceeds 24 hour max
    const manager = createManager({ inactivityTimeoutSeconds: 25 * 60 * 60 });
    const attrs = manager.onSessionPartStart();
    expect(attrs['emb.user_session_inactivity_timeout_seconds']).to.equal(1800);
  });

  it('should increment user session number monotonically', () => {
    const manager = createManager();

    manager.onSessionPartStart();
    manager.onSessionPartEnd();
    // Expire the session
    clock.tick(31 * 60 * 1000);

    const attrs2 = manager.onSessionPartStart();
    manager.onSessionPartEnd();
    clock.tick(31 * 60 * 1000);

    const attrs3 = manager.onSessionPartStart();

    expect(attrs2['emb.user_session_number']).to.equal(2);
    expect(attrs3['emb.user_session_number']).to.equal(3);

    // Verify stored counter
    expect(storage.getItem('embrace_user_session_number')).to.equal('3');
  });

  it('should clear max duration timer when part ends normally', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });

    const endSessionPartSpy = sinon.spy();
    manager.setSessionPartCallbacks({
      endSessionPart: endSessionPartSpy,
      startSessionPart: () => {
        // no-op
      },
    });

    manager.onSessionPartStart();
    manager.onSessionPartEnd();

    // Timer should be cleared, advancing past max duration should not fire
    clock.tick(3601 * 1000);
    expect(endSessionPartSpy).to.not.have.been.called;
  });

  it('should persist session state to storage', () => {
    const manager = createManager();
    manager.onSessionPartStart();

    const raw = storage.getItem('embrace_user_session_state');
    expect(raw).to.not.be.null;

    const state = JSON.parse(raw as string);
    expect(state.userSessionId).to.have.lengthOf(32);
    expect(state.userSessionNumber).to.equal(1);
    expect(state.userSessionPartNumber).to.equal(1);
  });

  it('should return null attributes when no session is active', () => {
    const manager = createManager();
    expect(manager.getUserSessionAttributes()).to.be.null;
    expect(manager.getUserSessionId()).to.be.null;
  });

  it('should return termination info as not final by default', () => {
    const manager = createManager();
    const info = manager.getTerminationInfo();
    expect(info.isFinal).to.be.false;
    expect(info.reason).to.be.null;
  });

  it('should create a different user session after endUserSession', () => {
    const manager = createManager();

    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        // Simulate what EmbraceSessionPartManager.endSessionPartInternal does:
        manager.getTerminationInfo();
        manager.onSessionPartEnd();
      },
      startSessionPart: () => {
        // no-op for startSessionPart
      },
    });

    const attrs1 = manager.onSessionPartStart();
    manager.endUserSession();

    const attrs2 = manager.onSessionPartStart();

    expect(attrs2['emb.user_session_id']).to.not.equal(
      attrs1['emb.user_session_id'],
    );
    expect(attrs2['emb.user_session_number']).to.equal(2);
    expect(attrs2['emb.user_session_part_number']).to.equal(1);
  });

  it('should clear storage after endUserSession', () => {
    const manager = createManager();
    manager.onSessionPartStart();

    expect(storage.getItem('embrace_user_session_state')).to.not.be.null;

    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        manager.getTerminationInfo();
        manager.onSessionPartEnd();
      },
      startSessionPart: () => {
        // no-op
      },
    });

    manager.endUserSession();

    expect(storage.getItem('embrace_user_session_state')).to.be.null;
  });

  it('should recover from endSessionPartCallback throwing in endUserSession', () => {
    const manager = createManager();

    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        throw new Error('callback failed');
      },
      startSessionPart: () => {
        // no-op
      },
    });

    manager.onSessionPartStart();
    manager.endUserSession();

    // State should be cleaned up despite the error
    expect(manager.getUserSessionId()).to.be.null;
    expect(manager.getUserSessionAttributes()).to.be.null;
    expect(manager.getTerminationInfo().isFinal).to.be.false;

    // Should be able to start a fresh session
    const attrs = manager.onSessionPartStart();
    expect(attrs['emb.user_session_id']).to.have.lengthOf(32);
  });

  it('should recover from endSessionPartCallback throwing in max duration timer', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });

    const startSessionPartSpy = sinon.spy();
    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        throw new Error('callback failed');
      },
      startSessionPart: startSessionPartSpy,
    });

    manager.onSessionPartStart();
    clock.tick(3601 * 1000);

    // State should be cleaned up despite the error
    expect(manager.getUserSessionId()).to.be.null;
    expect(manager.getTerminationInfo().isFinal).to.be.false;

    // startSessionPartCallback should still have been called
    expect(startSessionPartSpy).to.have.been.calledOnce;
  });

  it('should still notify ended listeners when endSessionPartCallback throws in endUserSession', () => {
    const manager = createManager();
    const endedListener = sinon.spy();
    manager.addUserSessionEndedListener(endedListener);

    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        throw new Error('callback failed');
      },
      startSessionPart: () => {
        // no-op
      },
    });

    manager.onSessionPartStart();
    manager.endUserSession();

    expect(endedListener).to.have.been.calledOnce;
  });

  it('should still notify ended listeners when endSessionPartCallback throws in max duration timer', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });
    const endedListener = sinon.spy();
    manager.addUserSessionEndedListener(endedListener);

    manager.setSessionPartCallbacks({
      endSessionPart: () => {
        throw new Error('callback failed');
      },
      startSessionPart: () => {
        // no-op
      },
    });

    manager.onSessionPartStart();
    clock.tick(3601 * 1000);

    expect(endedListener).to.have.been.calledOnce;
  });

  it('should expose the dying user session id to ended listeners on manual end', () => {
    const manager = createManager();
    const attrs = manager.onSessionPartStart();
    const dyingId = attrs['emb.user_session_id'];

    let observedId: string | null | undefined;
    manager.addUserSessionEndedListener(() => {
      observedId = manager.getUserSessionId();
    });

    manager.endUserSession();

    expect(observedId).to.equal(dyingId);
    expect(manager.getUserSessionId()).to.be.null;
    expect(manager.getPreviousUserSessionId()).to.equal(dyingId);
  });

  it('should expose the dying user session id to ended listeners on max-duration rollover', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });
    const attrs = manager.onSessionPartStart();
    const dyingId = attrs['emb.user_session_id'];

    let observedId: string | null | undefined;
    manager.addUserSessionEndedListener(() => {
      observedId = manager.getUserSessionId();
    });

    clock.tick(3601 * 1000);

    expect(observedId).to.equal(dyingId);
    expect(manager.getUserSessionId()).to.be.null;
    expect(manager.getPreviousUserSessionId()).to.equal(dyingId);
  });

  describe('setSessionId override', () => {
    it('should emit session.id equal to emb.user_session_id by default', () => {
      const manager = createManager();
      const attrs = manager.onSessionPartStart();
      expect(attrs['session.id']).to.equal(attrs['emb.user_session_id']);
    });

    it('should override session.id without changing emb.user_session_id', () => {
      const manager = createManager();
      manager.onSessionPartStart();
      manager.setSessionId('custom-session-id');

      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal('custom-session-id');
      expect(attrs?.['emb.user_session_id']).to.have.lengthOf(32);
      expect(attrs?.['emb.user_session_id']).to.not.equal('custom-session-id');
    });

    it('should clear the override when setSessionId(null) is called', () => {
      const manager = createManager();
      manager.onSessionPartStart();
      manager.setSessionId('custom-session-id');
      manager.setSessionId(null);

      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal(attrs?.['emb.user_session_id']);
    });

    it('should keep the override active across user session boundaries until cleared', () => {
      const manager = createManager();
      manager.onSessionPartStart();
      manager.setSessionId('custom-session-id');

      manager.onSessionPartEnd();
      clock.tick(31 * 60 * 1000);
      const attrs = manager.onSessionPartStart();

      expect(attrs['session.id']).to.equal('custom-session-id');
      expect(attrs['emb.user_session_id']).to.not.equal('custom-session-id');
    });

    it('should warn and ignore setSessionId when called with an empty string', () => {
      const manager = createManager();
      manager.onSessionPartStart();
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
      manager.onSessionPartStart();
      manager.setSessionId('custom-session-id');

      manager.setSessionId('   ');

      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal('custom-session-id');
      expect(
        diag.getWarnLogs().some((l) => l.includes('empty or whitespace-only')),
      ).to.equal(true);
    });
  });

  describe('listener subscribe / unsubscribe', () => {
    it('should notify started listeners when a user session begins', () => {
      const manager = createManager();
      const listener = sinon.spy();
      manager.addUserSessionStartedListener(listener);

      manager.onSessionPartStart();

      expect(listener).to.have.been.calledOnce;
    });

    it('should stop notifying started listeners after unsubscribe', () => {
      const manager = createManager();
      const listener = sinon.spy();
      const unsubscribe = manager.addUserSessionStartedListener(listener);

      unsubscribe();
      manager.onSessionPartStart();

      expect(listener).to.not.have.been.called;
    });

    it('should only unsubscribe the targeted listener when two are registered', () => {
      const manager = createManager();
      const first = sinon.spy();
      const second = sinon.spy();

      const unsubscribeFirst = manager.addUserSessionStartedListener(first);
      manager.addUserSessionStartedListener(second);

      unsubscribeFirst();
      manager.onSessionPartStart();

      expect(first).to.not.have.been.called;
      expect(second).to.have.been.calledOnce;
    });

    it('should notify ended listeners when a user session ends', () => {
      const manager = createManager();
      const listener = sinon.spy();
      manager.addUserSessionEndedListener(listener);

      manager.onSessionPartStart();
      manager.endUserSession();

      expect(listener).to.have.been.calledOnce;
    });

    it('should stop notifying ended listeners after unsubscribe', () => {
      const manager = createManager();
      const listener = sinon.spy();
      const unsubscribe = manager.addUserSessionEndedListener(listener);

      manager.onSessionPartStart();
      unsubscribe();
      manager.endUserSession();

      expect(listener).to.not.have.been.called;
    });

    it('should only unsubscribe the targeted ended listener when two are registered', () => {
      const manager = createManager();
      const first = sinon.spy();
      const second = sinon.spy();

      const unsubscribeFirst = manager.addUserSessionEndedListener(first);
      manager.addUserSessionEndedListener(second);

      manager.onSessionPartStart();
      unsubscribeFirst();
      manager.endUserSession();

      expect(first).to.not.have.been.called;
      expect(second).to.have.been.calledOnce;
    });
  });

  describe('endUserSession cooldown', () => {
    it('should warn and skip when called within the 5s cooldown window', () => {
      const manager = createManager();

      manager.onSessionPartStart();
      manager.endUserSession();
      manager.onSessionPartStart();

      clock.tick(2 * 1000);
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        true,
      );
      expect(manager.getUserSessionId()).to.not.be.null;
    });

    it('should process normally when called after the 5s cooldown window', () => {
      const manager = createManager();

      manager.onSessionPartStart();
      manager.endUserSession();
      manager.onSessionPartStart();

      clock.tick(6 * 1000);
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        false,
      );
      expect(manager.getUserSessionId()).to.be.null;
    });

    it('should process normally exactly at the 5s cooldown boundary (strict less-than)', () => {
      const manager = createManager();

      manager.onSessionPartStart();
      manager.endUserSession();
      manager.onSessionPartStart();

      clock.tick(5 * 1000);
      manager.endUserSession();

      expect(diag.getWarnLogs().some((l) => l.includes('cooldown'))).to.equal(
        false,
      );
      expect(manager.getUserSessionId()).to.be.null;
    });

    it('should reject end calls in the cooldown window even when no session is active', () => {
      const manager = createManager();

      manager.onSessionPartStart();
      manager.endUserSession();

      // No active session here, but still inside the cooldown window:
      // the cooldown must reject before the no-active-session no-op so the
      // next active session cannot be ended within the cooldown.
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
      const attrs = manager.onSessionPartStart();
      expect(attrs['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxDurationSeconds is zero', () => {
      const manager = createManager({ maxDurationSeconds: 0 });
      const attrs = manager.onSessionPartStart();
      expect(attrs['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxDurationSeconds is negative', () => {
      const manager = createManager({ maxDurationSeconds: -60 });
      const attrs = manager.onSessionPartStart();
      expect(attrs['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when inactivityTimeoutSeconds is below minimum', () => {
      // MIN is 30s; 10s is below minimum
      const manager = createManager({ inactivityTimeoutSeconds: 10 });
      const attrs = manager.onSessionPartStart();
      expect(attrs['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should fall back to default when inactivityTimeoutSeconds is zero', () => {
      const manager = createManager({ inactivityTimeoutSeconds: 0 });
      const attrs = manager.onSessionPartStart();
      expect(attrs['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should fall back to default when inactivityTimeoutSeconds is negative', () => {
      const manager = createManager({ inactivityTimeoutSeconds: -60 });
      const attrs = manager.onSessionPartStart();
      expect(attrs['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });
  });

  describe('inactivity > max fallback', () => {
    it('should fall back to default inactivity when configured inactivity exceeds max duration', () => {
      // max = 1h, inactivity = 2h (both inside their own min/max range, but inactivity > max)
      const manager = createManager({
        maxDurationSeconds: 3600,
        inactivityTimeoutSeconds: 7200,
      });
      const attrs = manager.onSessionPartStart();
      expect(attrs['emb.user_session_max_duration_seconds']).to.equal(3600);
      expect(attrs['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });
  });

  describe('clock anomaly handling (spec 6.1)', () => {
    it('should start a fresh session when device time is before stored session start', () => {
      const manager1 = createManager();
      const attrs1 = manager1.onSessionPartStart();
      manager1.onSessionPartEnd();

      // Simulate device clock jumping backward (before userSessionStartTs).
      const rawBefore = storage.getItem('embrace_user_session_state');
      expect(rawBefore).to.not.be.null;
      const state = JSON.parse(rawBefore as string);
      state.userSessionStartTs = 60 * 60 * 1000;
      state.sessionMaxEndTs = state.userSessionStartTs + 12 * 60 * 60 * 1000;
      state.inactivityDeadlineTs = state.userSessionStartTs + 30 * 60 * 1000;
      storage.setItem('embrace_user_session_state', JSON.stringify(state));

      // clock.now is 0, which is before userSessionStartTs=3600000.
      const manager2 = createManager();
      const attrs2 = manager2.onSessionPartStart();

      expect(attrs2['emb.user_session_id']).to.not.equal(
        attrs1['emb.user_session_id'],
      );
      expect(attrs2['emb.user_session_number']).to.equal(2);
    });
  });

  describe('inactivity timeout invalidation (spec 1.1)', () => {
    it('should leave inactivityDeadlineTs null while the first foreground part is active', () => {
      const manager = createManager();
      manager.onSessionPartStart();

      const raw = storage.getItem('embrace_user_session_state');
      const state = JSON.parse(raw as string);
      void expect(state.inactivityDeadlineTs).to.be.null;
    });

    it('should set inactivityDeadlineTs when the part ends', () => {
      const manager = createManager({ inactivityTimeoutSeconds: 120 });
      manager.onSessionPartStart();
      clock.tick(10 * 1000);
      manager.onSessionPartEnd();

      const raw = storage.getItem('embrace_user_session_state');
      const state = JSON.parse(raw as string);
      expect(state.inactivityDeadlineTs).to.equal(10 * 1000 + 120 * 1000);
    });

    it('should clear inactivityDeadlineTs when a continuing part starts', () => {
      const manager = createManager();
      manager.onSessionPartStart();
      manager.onSessionPartEnd();

      // A continuing part (within timeout) should clear the persisted value.
      clock.tick(60 * 1000);
      manager.onSessionPartStart();

      const raw = storage.getItem('embrace_user_session_state');
      const state = JSON.parse(raw as string);
      void expect(state.inactivityDeadlineTs).to.be.null;
    });

    it('should not expire on inactivity when recovering a session with no prior part-end', () => {
      const manager1 = createManager({ maxDurationSeconds: 12 * 60 * 60 });
      const attrs1 = manager1.onSessionPartStart();
      // Simulate a crash: no onSessionPartEnd call, state left with inactivityDeadlineTs=null.

      // Fast forward past the default inactivity timeout but within max duration.
      clock.tick(60 * 60 * 1000);

      const manager2 = createManager({ maxDurationSeconds: 12 * 60 * 60 });
      const attrs2 = manager2.onSessionPartStart();

      expect(attrs2['emb.user_session_id']).to.equal(
        attrs1['emb.user_session_id'],
      );
    });
  });

  describe('corrupt storage recovery', () => {
    it('should recover by discarding corrupt session state and starting fresh', () => {
      storage.setItem('embrace_user_session_state', 'not-valid-json{{{');

      const manager = createManager();
      const attrs = manager.onSessionPartStart();

      expect(attrs['emb.user_session_id']).to.have.lengthOf(32);
      expect(attrs['emb.user_session_number']).to.equal(1);
      expect(diag.getErrorLogs().some((l) => l.includes('corrupt'))).to.equal(
        true,
      );

      const freshRaw = storage.getItem('embrace_user_session_state');
      expect(freshRaw).to.not.equal('not-valid-json{{{');
      expect(() => JSON.parse(freshRaw as string)).to.not.throw();
    });
  });
});
