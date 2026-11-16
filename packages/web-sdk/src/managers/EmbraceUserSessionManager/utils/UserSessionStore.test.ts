import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../../../tests/utils/index.ts';
import { NamespacedStorage } from '../../../utils/index.ts';
import { createUserSessionState } from './state.ts';
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

  it('clears the stored state', () => {
    store.write(createState());

    store.clear();

    void expect(store.read()).to.be.null;
    void expect(backing.getItem(STATE_KEY)).to.be.null;
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

    it('reads the pinned user session after another tab clears it', () => {
      otherTab.clear();

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

    it("doesn't write the pinned user session back after another tab clears it", () => {
      otherTab.clear();

      store.write({ ...state, userSessionProperties: { own: '1' } });

      void expect(backing.getItem(STATE_KEY)).to.be.null;
    });

    it('reads storage again once unpinned', () => {
      const replacement = createState();
      otherTab.write(replacement);

      store.unpin();

      expect(store.read()).to.deep.equal(replacement);
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
