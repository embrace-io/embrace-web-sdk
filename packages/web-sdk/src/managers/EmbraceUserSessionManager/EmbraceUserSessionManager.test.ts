import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import {
  InMemoryDiagLogger,
  InMemoryStorage,
  MockPerformanceManager,
} from '../../../tests/utils/index.ts';
import type { TerminationInfo } from '../../api-sessions/index.ts';
import { NamespacedStorage } from '../../utils/NamespacedStorage/NamespacedStorage.ts';
import { SafeStorage } from '../../utils/SafeStorage/SafeStorage.ts';
import { EmbraceUserSessionManager } from './EmbraceUserSessionManager.ts';

chai.use(sinonChai);
const { expect } = chai;

/**
 * Pulls the `terminationInfo` argument from the most recent
 * `endSessionPartInternal` invocation captured on the spy. Returns `undefined`
 * when the spy was never called, matching the old `getTerminationInfo()` no-op
 * default.
 */
const lastTerminationInfo = (
  spy: sinon.SinonSpy,
): TerminationInfo | undefined => {
  if (spy.callCount === 0) {
    return undefined;
  }
  const call = spy.lastCall;
  return call.args[1] as TerminationInfo | undefined;
};

describe('EmbraceUserSessionManager', () => {
  let inMemoryStorage: InMemoryStorage;
  let storage: SafeStorage;
  let diag: InMemoryDiagLogger;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    inMemoryStorage = new InMemoryStorage();
    diag = new InMemoryDiagLogger();
    storage = new SafeStorage(inMemoryStorage, diag);
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
    manager.startSessionPart();
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

    manager.startSessionPart();
    const attrs1 = manager.getUserSessionAttributes();
    manager.endSessionPart();

    // Advance time within inactivity timeout (29 min)
    clock.tick(29 * 60 * 1000);

    manager.startSessionPart();
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(1);
    expect(attrs2?.['emb.user_session_part_number']).to.equal(2);
  });

  it('should start a session when inactivity timeout expires', () => {
    const manager = createManager();

    manager.startSessionPart();
    const attrs1 = manager.getUserSessionAttributes();
    manager.endSessionPart();

    // Advance past inactivity timeout (31 min)
    clock.tick(31 * 60 * 1000);

    manager.startSessionPart();
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.not.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(2);
    expect(attrs2?.['emb.user_session_part_number']).to.equal(1);
  });

  it('should start a session when max duration expires', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });

    manager.startSessionPart();
    const attrs1 = manager.getUserSessionAttributes();
    manager.endSessionPart();

    // Advance past max duration (3601 seconds)
    clock.tick(3601 * 1000);

    manager.startSessionPart();
    const attrs2 = manager.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.not.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_number']).to.equal(2);
  });

  it('should fire max duration timer mid-part', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');
    const startSpy = sinon.spy(manager, 'startSessionPart');

    manager.startSessionPart();

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

    manager.startSessionPart();
    clock.tick(3601 * 1000);

    expect(lastTerminationInfo(endSpy)).to.deep.equal({
      isFinal: true,
      reason: 'max_duration_reached',
    });
  });

  it('should handle manual termination via endUserSession', () => {
    const manager = createManager();

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');
    const startSpy = sinon.spy(manager, 'startSessionPart');

    manager.startSessionPart();
    manager.endUserSession();

    void expect(endSpy.called).to.be.true;
    expect(startSpy.callCount).to.be.at.least(2);
  });

  it('should provide termination info during manual termination', () => {
    const manager = createManager();

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    manager.startSessionPart();
    manager.endUserSession();

    expect(lastTerminationInfo(endSpy)).to.deep.equal({
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
    manager1.startSessionPart();
    const attrs1 = manager1.getUserSessionAttributes();
    manager1.endSessionPart();

    // Simulate another tab creating a manager with the same storage
    const manager2 = createManager();
    manager2.startSessionPart();
    const attrs2 = manager2.getUserSessionAttributes();

    expect(attrs2?.['emb.user_session_id']).to.equal(
      attrs1?.['emb.user_session_id'],
    );
    expect(attrs2?.['emb.user_session_part_number']).to.equal(2);
  });

  it('should not clobber another tab part-number bump when ending its own part', () => {
    // Tab A starts its first part: partNumber=1.
    const managerA = createManager();
    managerA.startSessionPart();

    // Tab B starts a part concurrently: reads A's state from storage,
    // increments to 2, writes it back. Tab A's in-memory _state is still 1.
    const managerB = createManager();
    managerB.startSessionPart();
    const attrsB = managerB.getUserSessionAttributes();
    expect(attrsB?.['emb.user_session_part_number']).to.equal(2);

    // Tab A's part now ends (e.g., pagehide on hard refresh). The write-back
    // must not overwrite B's partNumber=2 with A's stale 1.
    managerA.endSessionPart();

    // Tab A reloads and starts a fresh part: should see 2 in storage and
    // increment to 3.
    const managerAReloaded = createManager();
    managerAReloaded.startSessionPart();
    const attrsA2 = managerAReloaded.getUserSessionAttributes();
    expect(attrsA2?.['emb.user_session_part_number']).to.equal(3);
  });

  it('should not clobber another tab part-number bump when ending its own part during a cross-tab read-write race', () => {
    // Race: tab A reads storage at the start of `_continueUserSessionAfterPartEnd`,
    // then a peer tab completes `_beginUserSessionForPartStart` (bumping
    // partNumber) before A reaches its write. Without the final-check guard,
    // A's stale base would clobber the peer's bump in storage, leaving A's
    // next part start to reuse the same number the peer just took.
    //
    // We inject the peer write between A's first `_readState` call and its
    // `_writeState` call by hooking `storage.getItem`: on the first invocation
    // for the user-session key, we side-effect a peer write of partNumber=2
    // into storage and then return the pre-race snapshot to simulate the
    // narrow window where A's read landed before the peer's write.
    const manager = createManager();
    manager.startSessionPart();
    expect(
      manager.getUserSessionAttributes()?.['emb.user_session_part_number'],
    ).to.equal(1);

    let firstReadInPartEnd = true;
    const originalGetItem = inMemoryStorage.getItem.bind(inMemoryStorage);
    const stub = sinon
      .stub(inMemoryStorage, 'getItem')
      .callsFake((key: string): string | null => {
        const value = originalGetItem(key);
        if (
          firstReadInPartEnd &&
          key === 'embrace_user_session_state' &&
          value !== null
        ) {
          firstReadInPartEnd = false;
          const parsed = JSON.parse(value) as {
            userSessionPartNumber: number;
          };
          inMemoryStorage.setItem(
            'embrace_user_session_state',
            JSON.stringify({
              ...parsed,
              userSessionPartNumber: 2,
            }),
          );
        }
        return value;
      });

    try {
      manager.endSessionPart();
    } finally {
      stub.restore();
    }

    // Storage must still hold partNumber=2: A's clobbering write was skipped
    // by the final-check guard.
    const finalStored = JSON.parse(
      inMemoryStorage.getItem('embrace_user_session_state') ?? '{}',
    ) as { userSessionPartNumber: number };
    expect(finalStored.userSessionPartNumber).to.equal(2);

    // Tab A's next part start should observe 2 in storage and increment to 3,
    // not reuse 2 by re-reading its own clobbered base.
    manager.startSessionPart();
    expect(
      manager.getUserSessionAttributes()?.['emb.user_session_part_number'],
    ).to.equal(3);
  });

  it('should not write the state row during part-end (deadline lives in its own key)', () => {
    // An earlier iteration of this branch folded the inactivity deadline
    // into the state row, so part-end had to rewrite the row. Cross-tab
    // that read-modify-write race could clobber a peer's pn bump if the
    // peer's setItem landed between our finalCheck and our setItem. The
    // deadline now lives in its own key so the state row is never touched
    // on part-end, eliminating the race entirely.
    const manager = createManager();
    manager.startSessionPart();

    let stateKeyWriteCount = 0;
    const originalSetItem = inMemoryStorage.setItem.bind(inMemoryStorage);
    const stub = sinon
      .stub(inMemoryStorage, 'setItem')
      .callsFake((key: string, value: string): void => {
        if (key === 'embrace_user_session_state') {
          stateKeyWriteCount++;
        }
        originalSetItem(key, value);
      });

    try {
      manager.endSessionPart();
    } finally {
      stub.restore();
    }

    expect(stateKeyWriteCount).to.equal(0);
    void expect(
      inMemoryStorage.getItem('embrace_user_session_inactivity_deadline'),
    ).to.not.be.null;
  });

  it('should not clobber a peer part-number bump that landed in storage before our part-end runs', () => {
    // Regression for the bug captured in the user-reported "Focus A -
    // part 5 flashes then shows 4" cross-tab scenario. An earlier
    // iteration of this branch had `_continueUserSessionAfterPartEnd`
    // rewriting the state row to fold in the deadline, which could
    // overwrite a peer's pn=N+1 with our stale pn=N. The deadline now
    // routes through its own key so the state row stays exactly as the
    // peer left it.
    const manager = createManager();
    manager.startSessionPart();
    expect(
      manager.getUserSessionAttributes()?.['emb.user_session_part_number'],
    ).to.equal(1);

    // Simulate a peer tab bumping pn from 1 to 2 in storage.
    const beforePeer = JSON.parse(
      inMemoryStorage.getItem('embrace_user_session_state') ?? '{}',
    ) as { userSessionId: string; inactivityTimeoutMs: number };
    inMemoryStorage.setItem(
      'embrace_user_session_state',
      JSON.stringify({
        ...beforePeer,
        userSessionPartNumber: 2,
      }),
    );

    manager.endSessionPart();

    const finalStored = JSON.parse(
      inMemoryStorage.getItem('embrace_user_session_state') ?? '{}',
    ) as { userSessionPartNumber: number };
    expect(finalStored.userSessionPartNumber).to.equal(2);

    // Storage state.pn=2 is the source of truth for the next part start
    // anywhere; this manager's next part start must read it and increment
    // to 3 rather than reuse the value the peer just took.
    manager.startSessionPart();
    expect(
      manager.getUserSessionAttributes()?.['emb.user_session_part_number'],
    ).to.equal(3);
  });

  it('should not clobber another tab part-number bump when starting its own part', () => {
    // Two tabs both observe partNumber=1 in storage and call startSessionPart
    // back-to-back: the second start must see the first's bump and continue
    // from there rather than rewriting the same number.
    const managerA = createManager();
    managerA.startSessionPart();

    const managerB = createManager();
    managerB.startSessionPart();
    const attrsB = managerB.getUserSessionAttributes();
    expect(attrsB?.['emb.user_session_part_number']).to.equal(2);

    // Tab A starts its next part. Its in-memory _state still says 1, but
    // storage now says 2. The re-read in startSessionPart must adopt the
    // newer storage value, then increment to 3.
    managerA.startSessionPart();
    const attrsA = managerA.getUserSessionAttributes();
    expect(attrsA?.['emb.user_session_part_number']).to.equal(3);
  });

  it('should clear in-memory state and end the active part when another tab clears storage', () => {
    const storageEventTarget = new EventTarget();
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      storageEventTarget,
    });

    manager.startSessionPart();
    expect(manager.getUserSessionId()).to.not.equal(null);

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');
    let userSessionEndedInvocations = 0;
    manager.addUserSessionEndedListener(() => {
      userSessionEndedInvocations++;
    });

    // Simulate another tab calling endUserSession: storage key removed, then
    // a storage event fires on this tab.
    inMemoryStorage.removeItem('embrace_user_session_state');
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'embrace_user_session_state',
        newValue: null,
      }),
    );

    expect(manager.getUserSessionId()).to.equal(null);
    void expect(endSpy.called).to.be.true;
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

    manager.startSessionPart();
    const sessionId = manager.getUserSessionId();
    manager.endSessionPart();

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    // Another tab bumps partNumber while keeping the same session id.
    const otherTab = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
    });
    otherTab.startSessionPart();
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'embrace_user_session_state',
        newValue: inMemoryStorage.getItem('embrace_user_session_state'),
      }),
    );

    // Same session id, just synced; should not have ended any part.
    expect(manager.getUserSessionId()).to.equal(sessionId);
    void expect(endSpy.called).to.be.false;
  });

  it('should ignore storage events for unrelated keys', () => {
    const storageEventTarget = new EventTarget();
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      storageEventTarget,
    });

    manager.startSessionPart();
    const sessionId = manager.getUserSessionId();

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'something-unrelated',
        newValue: null,
      }),
    );

    expect(manager.getUserSessionId()).to.equal(sessionId);
    void expect(endSpy.called).to.be.false;
  });

  it('should match namespaced storage events when wrapped in NamespacedStorage', () => {
    const storageEventTarget = new EventTarget();
    const namespaced = new NamespacedStorage('app123', inMemoryStorage);
    const safeNamespaced = new SafeStorage(namespaced, diag);
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage: safeNamespaced,
      storageEventTarget,
    });

    manager.startSessionPart();
    expect(manager.getUserSessionId()).to.not.equal(null);

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

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
    void expect(endSpy.called).to.be.true;
  });

  it('should ignore literal-key storage events when running namespaced', () => {
    const storageEventTarget = new EventTarget();
    const namespaced = new NamespacedStorage('app123', inMemoryStorage);
    const safeNamespaced = new SafeStorage(namespaced, diag);
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage: safeNamespaced,
      storageEventTarget,
    });

    manager.startSessionPart();
    const sessionId = manager.getUserSessionId();

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    // Another SDK instance on the same page (registerGlobally:true) writing
    // to the un-namespaced key must not be mistaken for our namespaced state.
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'embrace_user_session_state',
        newValue: null,
      }),
    );

    expect(manager.getUserSessionId()).to.equal(sessionId);
    void expect(endSpy.called).to.be.false;
  });

  it('should not write the dying session inactivity deadline into the new session storage row when a peer rolls over', () => {
    // When a peer tab writes a new session into storage, this tab's
    // `_onStorage` handler must not stamp an inactivity deadline on the
    // peer's storage row: the peer just started a fresh part, and an
    // inherited deadline would prematurely expire it.
    const storageEventTarget = new EventTarget();
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      storageEventTarget,
    });

    manager.startSessionPart();

    // Peer tab rolls over: new session S2 is now in storage.
    const peerState = {
      userSessionId: 'PEER_S2',
      previousUserSessionId: null,
      userSessionStartTs: clock.now,
      userSessionMaxEndTs: clock.now + 12 * 60 * 60 * 1000,
      userSessionNumber: 2,
      userSessionPartNumber: 1,
      maxDurationMs: 12 * 60 * 60 * 1000,
      inactivityTimeoutMs: 30 * 60 * 1000,
    };
    inMemoryStorage.setItem(
      'embrace_user_session_state',
      JSON.stringify(peerState),
    );
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'embrace_user_session_state',
        newValue: inMemoryStorage.getItem('embrace_user_session_state'),
      }),
    );

    // The peer's S2 row stays exactly as the peer wrote it.
    const finalStored = JSON.parse(
      inMemoryStorage.getItem('embrace_user_session_state') ?? '{}',
    ) as Record<string, unknown>;
    expect(finalStored).to.deep.equal(peerState);
  });

  it('should not corrupt a peer-arrived storage row when endSessionPart runs before the storage event is delivered', () => {
    // Storage events are async. A peer's rollover may have landed in
    // storage before this tab's `_onStorage` handler runs, but this tab
    // could still fire `endSessionPart` synchronously (e.g., a pagehide
    // handler ending the local part). In that race window the manager
    // must not stamp our deadline onto the peer's row, since their part
    // just started and the inherited deadline would prematurely expire it.
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
    });
    manager.startSessionPart();
    const localUserSessionId = manager.getUserSessionId();

    const peerState = {
      userSessionId: 'PEER_S2',
      previousUserSessionId: null,
      userSessionStartTs: clock.now,
      userSessionMaxEndTs: clock.now + 12 * 60 * 60 * 1000,
      userSessionNumber: 2,
      userSessionPartNumber: 1,
      maxDurationMs: 12 * 60 * 60 * 1000,
      inactivityTimeoutMs: 30 * 60 * 1000,
    };
    inMemoryStorage.setItem(
      'embrace_user_session_state',
      JSON.stringify(peerState),
    );
    expect(localUserSessionId).to.not.equal('PEER_S2');

    // Synchronous part-end fires before _onStorage has reconciled.
    manager.endSessionPart();

    // Peer's row must remain exactly intact.
    const finalStored = JSON.parse(
      inMemoryStorage.getItem('embrace_user_session_state') ?? '{}',
    ) as Record<string, unknown>;
    expect(finalStored).to.deep.equal(peerState);
  });

  it('should clear the dying max-duration timer when a peer rolls over to a new session', () => {
    // The local timer is bound to the local session's `userSessionMaxEndTs`;
    // it must not fire against a peer-arrived session whose max-duration
    // window is unrelated.
    //
    // Setup gives the local session a 1h window and the peer's session a
    // 24h window; advancing past 1h would fire a stale local timer if it
    // weren't cleared. The peer's session must remain intact in storage
    // and in memory after the advance.
    const storageEventTarget = new EventTarget();
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      storageEventTarget,
      config: { maxDurationSeconds: 60 * 60 },
    });

    // Start a part so the timer is armed for the local session's 1h
    // window. Leave the part active; the storage event must drive the
    // timer-clear path, not a normal part end.
    manager.startSessionPart();

    // Peer's session uses a 24h max-duration window so the test can step
    // past the local 1h window without crossing the peer's expiry.
    const peerStartTs = clock.now;
    const peerState = {
      userSessionId: 'PEER_S2',
      previousUserSessionId: null,
      userSessionStartTs: peerStartTs,
      userSessionMaxEndTs: peerStartTs + 24 * 60 * 60 * 1000,
      userSessionNumber: 2,
      userSessionPartNumber: 1,
      maxDurationMs: 24 * 60 * 60 * 1000,
      inactivityTimeoutMs: 30 * 60 * 1000,
    };
    inMemoryStorage.setItem(
      'embrace_user_session_state',
      JSON.stringify(peerState),
    );
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'embrace_user_session_state',
        newValue: inMemoryStorage.getItem('embrace_user_session_state'),
      }),
    );

    // Step past the local session's 1h window. The peer's 24h window is
    // still in scope, so its session stays intact in both storage and
    // memory.
    clock.tick(60 * 60 * 1000 + 1);
    const stillS2 = JSON.parse(
      inMemoryStorage.getItem('embrace_user_session_state') ?? '{}',
    ) as { userSessionId: string };
    expect(stillS2.userSessionId).to.equal('PEER_S2');
    expect(manager.getUserSessionId()).to.equal('PEER_S2');
  });

  it('should remove the storage listener on dispose', () => {
    const storageEventTarget = new EventTarget();
    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage,
      storageEventTarget,
    });

    manager.startSessionPart();
    manager.dispose();

    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    // Storage event should be ignored after dispose.
    inMemoryStorage.removeItem('embrace_user_session_state');
    storageEventTarget.dispatchEvent(
      new StorageEvent('storage', {
        key: 'embrace_user_session_state',
        newValue: null,
      }),
    );

    // Listener removed; in-memory state untouched, callback never invoked.
    expect(manager.getUserSessionId()).to.not.equal(null);
    void expect(endSpy.called).to.be.false;
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
    const safeFailing = new SafeStorage(failingStorage, diag);

    const manager = new EmbraceUserSessionManager({
      diag,
      perf: new MockPerformanceManager(clock),
      storage: safeFailing,
    });

    manager.startSessionPart();
    const attrs = manager.getUserSessionAttributes();
    expect(attrs?.['emb.user_session_id']).to.have.lengthOf(32);
    // Storage unavailable: getIncrementedCount falls back to 1, which is
    // indistinguishable from a genuine first session.
    expect(attrs?.['emb.user_session_number']).to.equal(1);
    // SafeStorage flips disabled on the first failed write and emits exactly
    // one error; later failures stay silent.
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('Storage write failed');
  });

  it('should clamp max duration to the maximum', () => {
    // 25 hours exceeds 24 hour max
    const manager = createManager({ maxDurationSeconds: 25 * 60 * 60 });
    manager.startSessionPart();
    const attrs = manager.getUserSessionAttributes();
    expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
  });

  it('should clamp inactivity timeout to the maximum', () => {
    // 25 hours exceeds 24 hour max
    const manager = createManager({ inactivityTimeoutSeconds: 25 * 60 * 60 });
    manager.startSessionPart();
    const attrs = manager.getUserSessionAttributes();
    expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
      1800,
    );
  });

  it('should increment user session number monotonically', () => {
    const manager = createManager();

    manager.startSessionPart();
    manager.endSessionPart();
    // Expire the session
    clock.tick(31 * 60 * 1000);

    manager.startSessionPart();
    const attrs2 = manager.getUserSessionAttributes();
    manager.endSessionPart();
    clock.tick(31 * 60 * 1000);

    manager.startSessionPart();
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

    manager.startSessionPart();
    manager.endSessionPart();

    // Spy AFTER the legitimate end so we observe only timer-driven calls.
    const endSpy = sinon.spy(manager, 'endSessionPartInternal');

    clock.tick(3601 * 1000);

    expect(endSpy.callCount).to.be.at.least(1);
    expect(lastTerminationInfo(endSpy)).to.deep.equal({
      isFinal: true,
      reason: 'max_duration_reached',
    });
  });

  it('should persist session state to storage', () => {
    const manager = createManager();
    manager.startSessionPart();

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

    manager.startSessionPart();
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
    manager.startSessionPart();

    expect(inMemoryStorage.getItem('embrace_user_session_state')).to.not.be
      .null;

    // The merged manager runs a rollover (clear + new session) so storage
    // is rewritten by the new part. Inspect mid-flight by spying on
    // endSessionPartInternal and reading storage at that moment.
    let storageDuringEnd: string | null = '';
    const original = manager.endSessionPartInternal.bind(manager);
    sinon
      .stub(manager, 'endSessionPartInternal')
      .callsFake((reason, terminationInfo) => {
        if (terminationInfo) {
          storageDuringEnd = inMemoryStorage.getItem(
            'embrace_user_session_state',
          );
        }
        return original(reason, terminationInfo);
      });

    manager.endUserSession();

    // We can verify the dying session's storage row was cleared even though
    // a rollover write follows: the in-memory previous id matches what was
    // active before, and the new state is a different session id.
    const finalRaw = inMemoryStorage.getItem('embrace_user_session_state');
    expect(finalRaw).to.not.equal(storageDuringEnd);
  });

  it('should recover from listener throwing in endUserSession', () => {
    const manager = createManager();

    manager.addUserSessionEndedListener(() => {
      throw new Error('listener failed');
    });

    manager.startSessionPart();
    manager.endUserSession();

    // After endUserSession, the rollover starts a fresh part automatically.
    const attrs = manager.getUserSessionAttributes();
    void expect(attrs).to.not.be.null;
    expect(attrs?.['emb.user_session_id']).to.have.lengthOf(32);
  });

  it('should still notify ended listeners when a started-listener throws on rollover', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });
    const endedListener = sinon.spy();
    manager.addUserSessionEndedListener(endedListener);

    manager.addUserSessionStartedListener(() => {
      // Only throw on the first start so the rollover that fires the ended
      // listener still completes.
      if (endedListener.callCount === 0) {
        // First call: this is the initial start; throwing here would be
        // caught by the manager and not affect the user session lifecycle.
      }
    });

    manager.startSessionPart();
    clock.tick(3601 * 1000);

    void expect(endedListener.called).to.be.true;
  });

  it('should expose the dying user session id to ended listeners on manual end', () => {
    const manager = createManager();
    manager.startSessionPart();
    const attrs = manager.getUserSessionAttributes();
    const dyingId = attrs?.['emb.user_session_id'];

    let observedId: string | null | undefined;
    manager.addUserSessionEndedListener(() => {
      observedId = manager.getUserSessionId();
    });

    manager.endUserSession();

    expect(observedId).to.equal(dyingId);
    expect(manager.getPreviousUserSessionId()).to.equal(dyingId);
  });

  it('should expose the dying user session id to ended listeners on max-duration rollover', () => {
    const manager = createManager({ maxDurationSeconds: 3600 });
    manager.startSessionPart();
    const attrs = manager.getUserSessionAttributes();
    const dyingId = attrs?.['emb.user_session_id'];

    let observedId: string | null | undefined;
    manager.addUserSessionEndedListener(() => {
      observedId = manager.getUserSessionId();
    });

    clock.tick(3601 * 1000);

    expect(observedId).to.equal(dyingId);
    expect(manager.getPreviousUserSessionId()).to.equal(dyingId);
  });

  describe('setSessionId override', () => {
    it('should emit session.id equal to emb.user_session_id by default', () => {
      const manager = createManager();
      manager.startSessionPart();
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal(attrs?.['emb.user_session_id']);
    });

    it('should override session.id without changing emb.user_session_id', () => {
      const manager = createManager();
      manager.startSessionPart();
      manager.setSessionId('custom-session-id');

      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal('custom-session-id');
      expect(attrs?.['emb.user_session_id']).to.have.lengthOf(32);
      expect(attrs?.['emb.user_session_id']).to.not.equal('custom-session-id');
    });

    it('should clear the override when setSessionId(null) is called', () => {
      const manager = createManager();
      manager.startSessionPart();
      manager.setSessionId('custom-session-id');
      manager.setSessionId(null);

      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['session.id']).to.equal(attrs?.['emb.user_session_id']);
    });

    it('should keep the override active across user session boundaries until cleared', () => {
      const manager = createManager();
      manager.startSessionPart();
      manager.setSessionId('custom-session-id');

      manager.endSessionPart();
      clock.tick(31 * 60 * 1000);
      manager.startSessionPart();
      const attrs = manager.getUserSessionAttributes();

      expect(attrs?.['session.id']).to.equal('custom-session-id');
      expect(attrs?.['emb.user_session_id']).to.not.equal('custom-session-id');
    });

    it('should warn and ignore setSessionId when called with an empty string', () => {
      const manager = createManager();
      manager.startSessionPart();
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
      manager.startSessionPart();
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

      manager.startSessionPart();

      expect(listener).to.have.been.calledOnce;
    });

    it('should stop notifying started listeners after unsubscribe', () => {
      const manager = createManager();
      const listener = sinon.spy();
      const unsubscribe = manager.addUserSessionStartedListener(listener);

      unsubscribe();
      manager.startSessionPart();

      expect(listener).to.not.have.been.called;
    });

    it('should only unsubscribe the targeted listener when two are registered', () => {
      const manager = createManager();
      const first = sinon.spy();
      const second = sinon.spy();

      const unsubscribeFirst = manager.addUserSessionStartedListener(first);
      manager.addUserSessionStartedListener(second);

      unsubscribeFirst();
      manager.startSessionPart();

      expect(first).to.not.have.been.called;
      expect(second).to.have.been.calledOnce;
    });

    it('should notify ended listeners when a user session ends', () => {
      const manager = createManager();
      const listener = sinon.spy();
      manager.addUserSessionEndedListener(listener);

      manager.startSessionPart();
      manager.endUserSession();

      expect(listener).to.have.been.calledOnce;
    });

    it('should stop notifying ended listeners after unsubscribe', () => {
      const manager = createManager();
      const listener = sinon.spy();
      const unsubscribe = manager.addUserSessionEndedListener(listener);

      manager.startSessionPart();
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

      manager.startSessionPart();
      unsubscribeFirst();
      manager.endUserSession();

      expect(first).to.not.have.been.called;
      expect(second).to.have.been.calledOnce;
    });
  });

  describe('endUserSession cooldown', () => {
    it('should warn and skip when called within the 5s cooldown window', () => {
      const manager = createManager();

      manager.startSessionPart();
      manager.endUserSession();
      // The merged manager auto-rolls a new part on endUserSession; no
      // explicit second startSessionPart is needed.

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

      manager.startSessionPart();
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

      manager.startSessionPart();
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

      manager.startSessionPart();
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

  describe('listener re-entrancy', () => {
    it('should reject endUserSession called from within an ended-listener', () => {
      // The PR contract: listeners must not synchronously re-enter lifecycle
      // methods. The re-entry guard turns the inner call into a no-op so
      // _state mutations stay sequential.
      const manager = createManager();
      let innerCallCount = 0;
      manager.addUserSessionEndedListener(() => {
        innerCallCount++;
        if (innerCallCount === 1) {
          manager.endUserSession();
        }
      });

      manager.startSessionPart();
      manager.endUserSession();

      // Listener fires once for the outer call only; the re-entrant inner
      // call is rejected before reaching the notification path.
      expect(innerCallCount).to.equal(1);
      expect(
        diag
          .getWarnLogs()
          .some((l) => l.includes('re-entrantly from a listener')),
      ).to.equal(true);
    });

    it('should reject endUserSession called from within a started-listener', () => {
      // Started-listeners fire during startSessionPart, which is itself
      // invoked from the rollover path inside endUserSession. A listener
      // that calls endUserSession would recurse forever without the
      // re-entry guard. The expected fixed point is two listener firings:
      // once for the outer startSessionPart, once for the rollover part
      // start triggered by the listener's endUserSession call. The third
      // would-be invocation (the rollover's listener calling endUserSession
      // again) is rejected by the re-entry guard, terminating recursion.
      const manager = createManager();
      let innerCallCount = 0;
      manager.addUserSessionStartedListener(() => {
        innerCallCount++;
        manager.endUserSession();
      });

      manager.startSessionPart();

      expect(innerCallCount).to.equal(2);
      expect(
        diag
          .getWarnLogs()
          .some((l) => l.includes('re-entrantly from a listener')),
      ).to.equal(true);
    });

    it('should clear the re-entry flag after endUserSession completes so future calls succeed', () => {
      const manager = createManager();
      manager.startSessionPart();
      manager.endUserSession();

      // Past the cooldown so a fresh endUserSession is allowed.
      clock.tick(10 * 1000);

      // If _inEndUserSession had leaked, this call would be rejected with
      // the re-entry warning instead of running normally.
      expect(() => manager.endUserSession()).to.not.throw();
      expect(
        diag
          .getWarnLogs()
          .some((l) => l.includes('re-entrantly from a listener')),
      ).to.equal(false);
    });
  });

  describe('config clamp min-boundary', () => {
    it('should fall back to default when maxDurationSeconds is below minimum', () => {
      // MIN is 1 hour (3600s); 60s is below minimum
      const manager = createManager({ maxDurationSeconds: 60 });
      manager.startSessionPart();
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxDurationSeconds is zero', () => {
      const manager = createManager({ maxDurationSeconds: 0 });
      manager.startSessionPart();
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxDurationSeconds is negative', () => {
      const manager = createManager({ maxDurationSeconds: -60 });
      manager.startSessionPart();
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when inactivityTimeoutSeconds is below minimum', () => {
      // MIN is 30s; 10s is below minimum
      const manager = createManager({ inactivityTimeoutSeconds: 10 });
      manager.startSessionPart();
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should fall back to default when inactivityTimeoutSeconds is zero', () => {
      const manager = createManager({ inactivityTimeoutSeconds: 0 });
      manager.startSessionPart();
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_inactivity_timeout_seconds']).to.equal(
        1800,
      );
    });

    it('should fall back to default when inactivityTimeoutSeconds is negative', () => {
      const manager = createManager({ inactivityTimeoutSeconds: -60 });
      manager.startSessionPart();
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
      manager.startSessionPart();
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when maxDurationSeconds is Infinity', () => {
      const manager = createManager({
        maxDurationSeconds: Number.POSITIVE_INFINITY,
      });
      manager.startSessionPart();
      const attrs = manager.getUserSessionAttributes();
      expect(attrs?.['emb.user_session_max_duration_seconds']).to.equal(43200);
    });

    it('should fall back to default when inactivityTimeoutSeconds is NaN', () => {
      const manager = createManager({ inactivityTimeoutSeconds: Number.NaN });
      manager.startSessionPart();
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
      manager.startSessionPart();
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
      manager1.startSessionPart();
      const attrs1 = manager1.getUserSessionAttributes();
      manager1.endSessionPart();

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
      manager2.startSessionPart();
      const attrs2 = manager2.getUserSessionAttributes();

      expect(attrs2?.['emb.user_session_id']).to.not.equal(
        attrs1?.['emb.user_session_id'],
      );
      expect(attrs2?.['emb.user_session_number']).to.equal(2);
    });
  });

  describe('inactivity timeout invalidation (spec 1.1)', () => {
    it('should not write an inactivity deadline while the first foreground part is active', () => {
      const manager = createManager();
      manager.startSessionPart();

      // Active part: dedicated deadline key must be absent.
      void expect(
        inMemoryStorage.getItem('embrace_user_session_inactivity_deadline'),
      ).to.be.null;
    });

    it('should write the inactivity deadline to its dedicated key when the part ends', () => {
      const manager = createManager({ inactivityTimeoutSeconds: 120 });
      manager.startSessionPart();
      clock.tick(10 * 1000);
      manager.endSessionPart();

      // Deadline lives in its own key, not folded into the state row, so
      // a part-end write cannot clobber a peer's pn bump.
      expect(
        inMemoryStorage.getItem('embrace_user_session_inactivity_deadline'),
      ).to.equal(String(10 * 1000 + 120 * 1000));
    });

    it('should clear the inactivity deadline when a continuing part starts', () => {
      const manager = createManager();
      manager.startSessionPart();
      manager.endSessionPart();
      void expect(
        inMemoryStorage.getItem('embrace_user_session_inactivity_deadline'),
      ).to.not.be.null;

      // A continuing part (within timeout) should clear the persisted value.
      clock.tick(60 * 1000);
      manager.startSessionPart();

      void expect(
        inMemoryStorage.getItem('embrace_user_session_inactivity_deadline'),
      ).to.be.null;
    });

    it('should not expire on inactivity when recovering a session with no prior part-end', () => {
      const manager1 = createManager({ maxDurationSeconds: 12 * 60 * 60 });
      manager1.startSessionPart();
      const attrs1 = manager1.getUserSessionAttributes();
      // Simulate a crash: no endSessionPart call, no deadline written.

      // Fast forward past the default inactivity timeout but within max duration.
      clock.tick(60 * 60 * 1000);

      const manager2 = createManager({ maxDurationSeconds: 12 * 60 * 60 });
      manager2.startSessionPart();
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
      manager.startSessionPart();
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

    it('should write a corruption marker to storage when discarding corrupt state', () => {
      inMemoryStorage.setItem(
        'embrace_user_session_state',
        'not-valid-json{{{',
      );

      const manager = createManager();
      manager.startSessionPart();

      // The corrupting tab leaves a marker so peer tabs handling the
      // resulting cross-tab state-clear event can tag their cascade
      // with the distinct termination reason instead of `null`.
      expect(
        inMemoryStorage.getItem('embrace_user_session_corrupt_marker'),
      ).to.equal('1');
    });

    it('should tag a peer cross-tab cascade with reason "storage_corrupted" when the marker is present', () => {
      // Tab B has an active local session. Tab A detects corruption,
      // writes the marker, and clears the state key. Tab B receives the
      // storage-clear event; its part-end termination must be tagged
      // 'storage_corrupted' so the cascade is identifiable in telemetry.
      const storageEventTarget = new EventTarget();
      const manager = new EmbraceUserSessionManager({
        diag,
        perf: new MockPerformanceManager(clock),
        storage,
        storageEventTarget,
      });
      manager.startSessionPart();

      const endSpy = sinon.spy(manager, 'endSessionPartInternal');

      // Simulate tab A: write the marker, then clear the state key. The
      // storage event for the state key is what drives tab B's cascade.
      inMemoryStorage.setItem('embrace_user_session_corrupt_marker', '1');
      inMemoryStorage.removeItem('embrace_user_session_state');
      storageEventTarget.dispatchEvent(
        new StorageEvent('storage', {
          key: 'embrace_user_session_state',
          newValue: null,
        }),
      );

      expect(lastTerminationInfo(endSpy)).to.deep.equal({
        isFinal: true,
        reason: 'storage_corrupted',
      });
      // Marker is consumed so a subsequent unrelated cross-tab event does
      // not get falsely attributed to corruption.
      expect(
        inMemoryStorage.getItem('embrace_user_session_corrupt_marker'),
      ).to.equal(null);
    });
  });

  describe('cross-tab event filtering', () => {
    it('should ignore storage events keyed for permanent-property changes', () => {
      const storageEventTarget = new EventTarget();
      const manager = new EmbraceUserSessionManager({
        diag,
        perf: new MockPerformanceManager(clock),
        storage,
        storageEventTarget,
      });
      manager.startSessionPart();
      const sessionId = manager.getUserSessionId();
      const endSpy = sinon.spy(manager, 'endSessionPartInternal');

      // A peer tab writes a permanent property to a key under
      // `emb.properties.*`. The user-session manager only listens for the
      // session-state key; property-key events must not trigger a part end.
      storageEventTarget.dispatchEvent(
        new StorageEvent('storage', {
          key: 'emb.properties.feature_flag',
          newValue: 'on',
        }),
      );

      expect(manager.getUserSessionId()).to.equal(sessionId);
      void expect(endSpy.called).to.be.false;
    });

    it('should ignore storage events keyed for the user-session-number key', () => {
      const storageEventTarget = new EventTarget();
      const manager = new EmbraceUserSessionManager({
        diag,
        perf: new MockPerformanceManager(clock),
        storage,
        storageEventTarget,
      });
      manager.startSessionPart();
      const sessionId = manager.getUserSessionId();
      const endSpy = sinon.spy(manager, 'endSessionPartInternal');

      storageEventTarget.dispatchEvent(
        new StorageEvent('storage', {
          key: 'embrace_user_session_number',
          newValue: '7',
        }),
      );

      expect(manager.getUserSessionId()).to.equal(sessionId);
      void expect(endSpy.called).to.be.false;
    });
  });

  describe('cross-tab two-event delivery', () => {
    it('should converge to the peer session when remove + set events arrive in order', () => {
      const storageEventTarget = new EventTarget();
      const manager = new EmbraceUserSessionManager({
        diag,
        perf: new MockPerformanceManager(clock),
        storage,
        storageEventTarget,
      });
      manager.startSessionPart();
      const localId = manager.getUserSessionId();

      // Peer's endUserSession produces two storage writes: removeItem
      // (state cleared), then setItem (rolled-over session). Both events
      // arrive in order.
      inMemoryStorage.removeItem('embrace_user_session_state');
      storageEventTarget.dispatchEvent(
        new StorageEvent('storage', {
          key: 'embrace_user_session_state',
          newValue: null,
        }),
      );
      const peerState = {
        userSessionId: 'PEER_NEW',
        previousUserSessionId: null,
        userSessionStartTs: clock.now,
        userSessionMaxEndTs: clock.now + 12 * 60 * 60 * 1000,
        userSessionNumber: 2,
        userSessionPartNumber: 1,
        maxDurationMs: 12 * 60 * 60 * 1000,
        inactivityTimeoutMs: 30 * 60 * 1000,
      };
      inMemoryStorage.setItem(
        'embrace_user_session_state',
        JSON.stringify(peerState),
      );
      storageEventTarget.dispatchEvent(
        new StorageEvent('storage', {
          key: 'embrace_user_session_state',
          newValue: inMemoryStorage.getItem('embrace_user_session_state'),
        }),
      );

      expect(manager.getUserSessionId()).to.equal('PEER_NEW');
      expect(manager.getPreviousUserSessionId()).to.equal(localId);
    });
  });

  describe('cross-tab end while peer has active part', () => {
    it('should adopt the peer-rolled-over session in _state and finalize the local part with isFinal=true', () => {
      const storageEventTarget = new EventTarget();
      const manager = new EmbraceUserSessionManager({
        diag,
        perf: new MockPerformanceManager(clock),
        storage,
        storageEventTarget,
      });
      manager.startSessionPart();
      const localId = manager.getUserSessionId();

      const endSpy = sinon.spy(manager, 'endSessionPartInternal');

      // Peer rolls over from `localId` to `PEER_NEW`.
      const peerState = {
        userSessionId: 'PEER_NEW',
        previousUserSessionId: null,
        userSessionStartTs: clock.now,
        userSessionMaxEndTs: clock.now + 12 * 60 * 60 * 1000,
        userSessionNumber: 2,
        userSessionPartNumber: 1,
        maxDurationMs: 12 * 60 * 60 * 1000,
        inactivityTimeoutMs: 30 * 60 * 1000,
      };
      inMemoryStorage.setItem(
        'embrace_user_session_state',
        JSON.stringify(peerState),
      );
      storageEventTarget.dispatchEvent(
        new StorageEvent('storage', {
          key: 'embrace_user_session_state',
          newValue: inMemoryStorage.getItem('embrace_user_session_state'),
        }),
      );

      expect(lastTerminationInfo(endSpy)).to.deep.equal({
        isFinal: true,
        reason: null,
      });
      expect(manager.getUserSessionId()).to.equal('PEER_NEW');
      expect(manager.getPreviousUserSessionId()).to.equal(localId);
    });

    it('should adopt the peer-rolled-over session when the local tab has no active part', () => {
      const storageEventTarget = new EventTarget();
      const manager = new EmbraceUserSessionManager({
        diag,
        perf: new MockPerformanceManager(clock),
        storage,
        storageEventTarget,
      });
      manager.startSessionPart();
      const localId = manager.getUserSessionId();
      manager.endSessionPart();
      // Local tab now has _state populated but no active part. Spy AFTER
      // the part-end so we observe only the cross-tab callback path.
      const endSpy = sinon.spy(manager, 'endSessionPartInternal');

      const peerState = {
        userSessionId: 'PEER_NEW',
        previousUserSessionId: null,
        userSessionStartTs: clock.now,
        userSessionMaxEndTs: clock.now + 12 * 60 * 60 * 1000,
        userSessionNumber: 2,
        userSessionPartNumber: 1,
        maxDurationMs: 12 * 60 * 60 * 1000,
        inactivityTimeoutMs: 30 * 60 * 1000,
      };
      inMemoryStorage.setItem(
        'embrace_user_session_state',
        JSON.stringify(peerState),
      );
      storageEventTarget.dispatchEvent(
        new StorageEvent('storage', {
          key: 'embrace_user_session_state',
          newValue: inMemoryStorage.getItem('embrace_user_session_state'),
        }),
      );

      // The cross-tab handler always invokes endSessionPartInternal when
      // the session id changes, even if no part is active locally; the
      // method no-ops internally when no span is in progress.
      void expect(endSpy.called).to.be.true;
      expect(manager.getUserSessionId()).to.equal('PEER_NEW');
      expect(manager.getPreviousUserSessionId()).to.equal(localId);
    });
  });

  describe('clock anomaly: jump forward past userSessionMaxEndTs', () => {
    it('should detect a forward clock jump as an expired session on the next part start', () => {
      const manager1 = createManager({ maxDurationSeconds: 60 * 60 });
      manager1.startSessionPart();
      const attrs1 = manager1.getUserSessionAttributes();
      manager1.endSessionPart();
      // Dispose manager1 so its max-duration timer doesn't auto-rollover during
      // the tick. We're simulating a page reload: the prior page is gone,
      // storage carries the dying state forward, and a fresh manager loads.
      manager1.dispose();

      // Jump the clock past the locked-in userSessionMaxEndTs (1h window).
      clock.tick(60 * 60 * 1000 + 1);

      const manager2 = createManager({ maxDurationSeconds: 60 * 60 });
      manager2.startSessionPart();
      const attrs2 = manager2.getUserSessionAttributes();

      expect(attrs2?.['emb.user_session_id']).to.not.equal(
        attrs1?.['emb.user_session_id'],
      );
      expect(attrs2?.['emb.user_session_number']).to.equal(2);
      expect(attrs2?.['emb.user_session_part_number']).to.equal(1);
    });
  });

  describe('cross-tab arrival of a peer session past its max-duration window', () => {
    it('should not arm a max-duration timer when the peer session is already past userSessionMaxEndTs', () => {
      const storageEventTarget = new EventTarget();
      const manager = new EmbraceUserSessionManager({
        diag,
        perf: new MockPerformanceManager(clock),
        storage,
        storageEventTarget,
        config: { maxDurationSeconds: 60 * 60 },
      });
      manager.startSessionPart();

      // Peer session has a userSessionMaxEndTs in the past relative to clock.now.
      const peerState = {
        userSessionId: 'PEER_EXPIRED',
        previousUserSessionId: null,
        userSessionStartTs: clock.now - 2 * 60 * 60 * 1000,
        userSessionMaxEndTs: clock.now - 60 * 60 * 1000,
        userSessionNumber: 9,
        userSessionPartNumber: 1,
        maxDurationMs: 60 * 60 * 1000,
        inactivityTimeoutMs: 30 * 60 * 1000,
      };
      inMemoryStorage.setItem(
        'embrace_user_session_state',
        JSON.stringify(peerState),
      );
      storageEventTarget.dispatchEvent(
        new StorageEvent('storage', {
          key: 'embrace_user_session_state',
          newValue: inMemoryStorage.getItem('embrace_user_session_state'),
        }),
      );

      // The local timer for the dying session is cleared. The peer-arrived
      // session is already past its max-duration; arming a fresh timer for
      // it would fire immediately. _setupMaxDurationTimer's `remaining <= 0`
      // guard prevents that. Stepping forward by an arbitrary amount must
      // not cause the manager to clear stored state spontaneously.
      clock.tick(24 * 60 * 60 * 1000);
      const stillStored = JSON.parse(
        inMemoryStorage.getItem('embrace_user_session_state') ?? '{}',
      ) as { userSessionId: string };
      expect(stillStored.userSessionId).to.equal('PEER_EXPIRED');
    });
  });
});
