import * as chai from 'chai';
import {
  blockWindowStorage,
  deleteIndexedDB,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../../../tests/utils/index.ts';
import { NamespacedStorage } from '../../../utils/NamespacedStorage/index.ts';
import {
  IndexedDBSessionPartCounters,
  LocalStorageSessionPartCounters,
} from './SessionPartCounters.ts';

const { expect } = chai;

const NAMESPACE = 'abc12';
const DATABASE_NAME = 'abc12__embrace_session_part_counters';
const OTHER_NAMESPACE = 'def34';
const OTHER_DATABASE_NAME = 'def34__embrace_session_part_counters';

const FIRST_INCREMENT = {
  userSessionId: 'user-session-1',
  storedUserSessionPartIndex: 0,
};

describe('LocalStorageSessionPartCounters', () => {
  it('increments the part number in localStorage and the part index from the stored one', async () => {
    const inMemoryStorage = new InMemoryStorage();
    const diag = new InMemoryDiagLogger();
    const storage = new NamespacedStorage({ storage: inMemoryStorage, diag });
    inMemoryStorage.setItem('embrace_session_part_number', '4');
    const counters = new LocalStorageSessionPartCounters({ storage, diag });

    expect(
      await counters.increment({
        userSessionId: 'user-session-1',
        storedUserSessionPartIndex: 2,
      }),
    ).to.deep.equal({ sessionPartNumber: 5, userSessionPartIndex: 3 });
    expect(inMemoryStorage.getItem('embrace_session_part_number')).to.equal(
      '5',
    );
  });
});

describe('IndexedDBSessionPartCounters', () => {
  let diag: InMemoryDiagLogger;
  let inMemoryStorage: InMemoryStorage;
  let storage: NamespacedStorage;
  let restoreIndexedDB: (() => void) | undefined;

  const createCounters = (namespace = NAMESPACE) =>
    new IndexedDBSessionPartCounters({ namespace, storage, diag });

  beforeEach(async () => {
    diag = new InMemoryDiagLogger();
    inMemoryStorage = new InMemoryStorage();
    storage = new NamespacedStorage({ storage: inMemoryStorage, diag });
    await deleteIndexedDB(DATABASE_NAME);
    await deleteIndexedDB(OTHER_DATABASE_NAME);
  });

  afterEach(async () => {
    restoreIndexedDB?.();
    restoreIndexedDB = undefined;
    await deleteIndexedDB(DATABASE_NAME);
    await deleteIndexedDB(OTHER_DATABASE_NAME);
  });

  it('increments both counters on every call, and writes the part number back to localStorage', async () => {
    const counters = createCounters();

    expect(await counters.increment(FIRST_INCREMENT)).to.deep.equal({
      sessionPartNumber: 1,
      userSessionPartIndex: 1,
    });
    expect(await counters.increment(FIRST_INCREMENT)).to.deep.equal({
      sessionPartNumber: 2,
      userSessionPartIndex: 2,
    });
    expect(inMemoryStorage.getItem('embrace_session_part_number')).to.equal(
      '2',
    );
  });

  it('continues from the counters in localStorage when they are higher', async () => {
    const counters = createCounters();

    await counters.increment(FIRST_INCREMENT);
    inMemoryStorage.setItem('embrace_session_part_number', '9');

    expect(
      await counters.increment({
        userSessionId: 'user-session-1',
        storedUserSessionPartIndex: 4,
      }),
    ).to.deep.equal({ sessionPartNumber: 10, userSessionPartIndex: 5 });
    expect(await counters.increment(FIRST_INCREMENT)).to.deep.equal({
      sessionPartNumber: 11,
      userSessionPartIndex: 6,
    });
  });

  it("restarts the part index for another user session from the user-session row's", async () => {
    const counters = createCounters();

    await counters.increment(FIRST_INCREMENT);
    await counters.increment(FIRST_INCREMENT);

    expect(
      await counters.increment({
        userSessionId: 'user-session-2',
        storedUserSessionPartIndex: 0,
      }),
    ).to.deep.equal({ sessionPartNumber: 3, userSessionPartIndex: 1 });
  });

  it('hands out distinct counters to concurrent increments from different tabs', async () => {
    const tabs = [createCounters(), createCounters()];

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        tabs[index % tabs.length].increment(FIRST_INCREMENT),
      ),
    );
    const sorted = (values: number[]) =>
      [...values].sort((first, second) => first - second);

    expect(
      sorted(results.map((counts) => counts.sessionPartNumber)),
    ).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(
      sorted(results.map((counts) => counts.userSessionPartIndex)),
    ).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(inMemoryStorage.getItem('embrace_session_part_number')).to.equal(
      '10',
    );
  });

  it('keeps the counters apart per namespace', async () => {
    await createCounters().increment(FIRST_INCREMENT);
    // Another app on the page keeps its own localStorage values too.
    inMemoryStorage.clear();

    expect(
      await createCounters(OTHER_NAMESPACE).increment(FIRST_INCREMENT),
    ).to.deep.equal({ sessionPartNumber: 1, userSessionPartIndex: 1 });
  });

  it('opens the database again after another tab deletes it', async () => {
    const counters = createCounters();

    await counters.increment(FIRST_INCREMENT);
    await deleteIndexedDB(DATABASE_NAME);
    inMemoryStorage.clear();

    expect(await counters.increment(FIRST_INCREMENT)).to.deep.equal({
      sessionPartNumber: 1,
      userSessionPartIndex: 1,
    });
  });

  it('increments the counters in localStorage and warns when IndexedDB cannot be used', async () => {
    restoreIndexedDB = blockWindowStorage('indexedDB');
    inMemoryStorage.setItem('embrace_session_part_number', '4');
    const counters = createCounters();

    expect(
      await counters.increment({
        userSessionId: 'user-session-1',
        storedUserSessionPartIndex: 2,
      }),
    ).to.deep.equal({ sessionPartNumber: 5, userSessionPartIndex: 3 });
    expect(inMemoryStorage.getItem('embrace_session_part_number')).to.equal(
      '5',
    );
    expect(diag.getWarnLogs()).to.include(
      'failed to increment the session part counters in IndexedDB; incrementing them in localStorage',
    );
  });
});
