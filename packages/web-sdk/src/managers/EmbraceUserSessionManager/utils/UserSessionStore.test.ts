import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../../../tests/utils/index.ts';
import { NamespacedStorage } from '../../../utils/index.ts';
import { createUserSessionState } from './state.ts';
import type { UserSessionChange } from './UserSessionStore.ts';
import { UserSessionStore } from './UserSessionStore.ts';

const { expect } = chai;

const STATE_KEY = 'embrace_user_session_state';

describe('UserSessionStore', () => {
  let diag: InMemoryDiagLogger;
  let backing: InMemoryStorage;
  let storage: NamespacedStorage;
  let store: UserSessionStore;

  const createState = () =>
    createUserSessionState({
      now: 1_700_000_000_000,
      previousUserSessionId: null,
      userSessionMaxDurationSeconds: 43200,
      userSessionInactivityTimeoutSeconds: 1800,
      userSessionForegroundInactivityTimeoutSeconds: 1800,
      userSessionNumber: 1,
    });

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    backing = new InMemoryStorage();
    storage = new NamespacedStorage({ storage: backing, diag });
    store = new UserSessionStore({ storage, diag });
  });

  it('returns null when nothing is stored', () => {
    void expect(store.read()).to.be.null;
  });

  it('writes the state to storage and reads it back', () => {
    const state = createState();

    expect(store.write(state)).to.equal(true);

    expect(store.read()).to.deep.equal(state);
    expect(JSON.parse(backing.getItem(STATE_KEY) as string)).to.deep.equal(
      state,
    );
  });

  it('reads a state another tab wrote', () => {
    const otherTab = new UserSessionStore({
      storage: new NamespacedStorage({ storage: backing, diag }),
      diag,
    });
    store.write(createState());
    const replacement = createState();

    otherTab.write(replacement);

    expect(store.read()?.userSessionId).to.equal(replacement.userSessionId);
  });

  it('returns the same object while the stored value is unchanged', () => {
    store.write(createState());

    const first = store.read();

    expect(store.read()).to.equal(first);
  });

  it('discards a corrupt stored value', () => {
    backing.setItem(STATE_KEY, '{not json');

    void expect(store.read()).to.be.null;
    void expect(backing.getItem(STATE_KEY)).to.be.null;
    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('corrupt');
  });

  it('discards a stored value from another schema version', () => {
    backing.setItem(
      STATE_KEY,
      JSON.stringify({ ...createState(), schemaVersion: -1 }),
    );

    void expect(store.read()).to.be.null;
    void expect(backing.getItem(STATE_KEY)).to.be.null;
  });

  it('reads an ended user session like any other', () => {
    const ended = { ...createState(), ended: true };

    store.write(ended);

    expect(store.read()).to.deep.equal(ended);
  });

  describe('pinned user session', () => {
    let otherTab: UserSessionStore;
    let state: ReturnType<typeof createState>;

    beforeEach(() => {
      otherTab = new UserSessionStore({
        storage: new NamespacedStorage({ storage: backing, diag }),
        diag,
      });
      state = createState();
      store.write(state);
      store.pin(state);
    });

    it('reads the pinned user session after another tab replaces it', () => {
      otherTab.write(createState());

      expect(store.read()).to.equal(state);
    });

    it('reads the pinned user session after storage is cleared', () => {
      backing.removeItem(STATE_KEY);

      expect(store.read()).to.equal(state);
    });

    it('refreshes the pin from writes and reads of the same user session', () => {
      const ownWrite = { ...state, userSessionProperties: { own: '1' } };
      store.write(ownWrite);

      expect(store.read()).to.deep.equal(ownWrite);

      const otherTabWrite = {
        ...ownWrite,
        userSessionProperties: { own: '1', other: '2' },
      };
      otherTab.write(otherTabWrite);

      expect(store.read()).to.deep.equal(otherTabWrite);

      otherTab.write(createState());

      expect(store.read()).to.deep.equal(otherTabWrite);
    });

    it('only updates the pin when storage holds another user session', () => {
      const replacement = createState();
      otherTab.write(replacement);
      const ownWrite = { ...state, userSessionProperties: { own: '1' } };

      expect(store.write(ownWrite)).to.equal(false);

      expect(store.read()).to.deep.equal(ownWrite);
      expect(otherTab.read()).to.deep.equal(replacement);
    });

    it("doesn't write the pinned user session back after storage is cleared", () => {
      backing.removeItem(STATE_KEY);

      store.write({ ...state, userSessionProperties: { own: '1' } });

      void expect(backing.getItem(STATE_KEY)).to.be.null;
    });

    it('keeps the live pin after another tab ends the same user session', () => {
      otherTab.write({ ...state, ended: true });

      expect(store.read()).to.equal(state);
    });

    it("doesn't write over another tab's ended marker for the pinned user session", () => {
      const ended = { ...state, ended: true };
      otherTab.write(ended);

      expect(
        store.write({ ...state, userSessionProperties: { own: '1' } }),
      ).to.equal(false);

      expect(otherTab.read()).to.deep.equal(ended);
    });

    it('reads storage again once unpinned', () => {
      const replacement = createState();
      otherTab.write(replacement);

      store.unpin();

      expect(store.read()).to.deep.equal(replacement);
    });
  });

  describe('last activity', () => {
    const LAST_ACTIVITY_KEY = 'embrace_last_activity';

    it('returns nothing when nothing valid is stored', () => {
      void expect(store.readLastActivity()).to.be.null;

      backing.setItem(LAST_ACTIVITY_KEY, '{not json');

      void expect(store.readLastActivity()).to.be.null;

      backing.setItem(LAST_ACTIVITY_KEY, JSON.stringify({ ts: 'soon' }));

      void expect(store.readLastActivity()).to.be.null;
    });

    it('keeps the later activity', () => {
      store.recordActivity(2000, 'part-a');
      store.recordActivity(1000, 'part-b');

      expect(store.readLastActivity()).to.deep.equal({
        ts: 2000,
        sessionPartId: 'part-a',
      });
    });

    it('replaces an activity at the same time', () => {
      store.recordActivity(2000, null);
      store.recordActivity(2000, 'part-a');

      expect(store.readLastActivity()).to.deep.equal({
        ts: 2000,
        sessionPartId: 'part-a',
      });
    });
  });

  describe('changes from other tabs', () => {
    const NAMESPACE = 'user-session-store-test';
    const NAMESPACED_STATE_KEY = `${NAMESPACE}__${STATE_KEY}`;
    let target: EventTarget;
    let listeningStore: UserSessionStore;
    let changes: UserSessionChange[];
    let removeListener: () => void;
    let state: ReturnType<typeof createState>;

    // A real `storage` event has to carry the real `localStorage`, which other
    // test files share, so only this namespace's key is written.
    const otherTabWrites = (value: object | null) => {
      const newValue = value === null ? null : JSON.stringify(value);

      if (newValue === null) {
        localStorage.removeItem(NAMESPACED_STATE_KEY);
      } else {
        localStorage.setItem(NAMESPACED_STATE_KEY, newValue);
      }

      target.dispatchEvent(
        new StorageEvent('storage', {
          key: NAMESPACED_STATE_KEY,
          newValue,
          storageArea: localStorage,
        }),
      );
    };

    beforeEach(() => {
      target = new EventTarget();
      changes = [];
      listeningStore = new UserSessionStore({
        storage: new NamespacedStorage({
          storage: localStorage,
          namespace: NAMESPACE,
          diag,
        }),
        diag,
        target,
      });
      removeListener = listeningStore.addUserSessionChangeListener((change) =>
        changes.push(change),
      );
      state = createState();
      listeningStore.write(state);
      listeningStore.pin(state);
    });

    afterEach(() => {
      removeListener();
      localStorage.removeItem(NAMESPACED_STATE_KEY);
    });

    it("refreshes the pin from another tab's write of the pinned user session", () => {
      const otherTabWrite = {
        ...state,
        userSessionProperties: { other: '1' },
      };

      otherTabWrites(otherTabWrite);
      // The other tab replaced the user session before this tab handled the
      // write, so only the event carries the property.
      localStorage.setItem(NAMESPACED_STATE_KEY, JSON.stringify(createState()));

      expect(listeningStore.read()).to.deep.equal(otherTabWrite);
      expect(changes).to.deep.equal([]);
    });

    it('reports an end of the pinned user session with its reason', () => {
      otherTabWrites({ ...state, ended: true, endReason: 'manual' });

      expect(changes).to.deep.equal([{ kind: 'ended', endReason: 'manual' }]);
    });

    it('reports a replacement of the pinned user session', () => {
      otherTabWrites(createState());

      expect(changes).to.deep.equal([{ kind: 'replaced' }]);
    });

    it('reports a removal or a clear of the pinned user session', () => {
      otherTabWrites(null);
      target.dispatchEvent(
        new StorageEvent('storage', { key: null, storageArea: localStorage }),
      );

      expect(changes).to.deep.equal([{ kind: 'cleared' }, { kind: 'cleared' }]);
    });

    it('writes the pin back over a stale write of the user session it follows', () => {
      const predecessor = createState();
      const next = {
        ...createState(),
        previousUserSessionId: predecessor.userSessionId,
      };
      listeningStore.write(next);
      listeningStore.pin(next);

      otherTabWrites({ ...predecessor, ended: true });

      expect(
        JSON.parse(localStorage.getItem(NAMESPACED_STATE_KEY) as string),
      ).to.deep.equal(next);
      expect(changes).to.deep.equal([]);
    });

    it('calls every listener, even after one throws', () => {
      const otherChanges: UserSessionChange[] = [];
      const removeThrowing = listeningStore.addUserSessionChangeListener(() => {
        throw new Error('listener failed');
      });
      const removeOther = listeningStore.addUserSessionChangeListener(
        (change) => otherChanges.push(change),
      );

      otherTabWrites(createState());

      expect(changes).to.deep.equal([{ kind: 'replaced' }]);
      expect(otherChanges).to.deep.equal([{ kind: 'replaced' }]);
      removeThrowing();
      removeOther();
    });

    it('ignores writes while nothing is pinned', () => {
      listeningStore.unpin();

      otherTabWrites(createState());

      expect(changes).to.deep.equal([]);
    });

    it('stops calling a listener once it is removed', () => {
      removeListener();

      otherTabWrites(createState());

      expect(changes).to.deep.equal([]);
    });
  });

  it('keeps the state for the page when storage writes fail', () => {
    const failingStorage = new NamespacedStorage({
      storage: new FailingStorage(),
      diag,
    });
    const state = createState();

    expect(
      new UserSessionStore({ storage: failingStorage, diag }).write(state),
    ).to.equal(false);

    // A fresh store has no cached copy, so this read comes from storage.
    expect(
      new UserSessionStore({ storage: failingStorage, diag }).read(),
    ).to.deep.equal(state);
  });
});
