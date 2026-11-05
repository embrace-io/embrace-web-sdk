import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  setupTestStorage,
} from '../../tests/utils/index.ts';
import { getIncrementedCount } from './getIncrementedCount.ts';
import { NamespacedStorage } from './NamespacedStorage/index.ts';

const { expect } = chai;

describe('getIncrementedCount', () => {
  let diag: InMemoryDiagLogger;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
  });

  it('should return an incremented count after each call', () => {
    const storage = setupTestStorage();

    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(2);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(3);

    storage.clear();
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
  });

  it('should count within the page when storage is unavailable', () => {
    const storage = new NamespacedStorage({
      storage: new FailingStorage(),
      diag,
    });

    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(2);

    // Only the first read reaches the failing storage: once writes are
    // disabled, the wrapper serves the count it kept in memory. The setItem
    // error logs only once.
    expect(
      diag.getWarnLogs().filter((m) => m.includes('failed to read my-key'))
        .length,
    ).to.equal(1);
    expect(
      diag.getErrorLogs().filter((m) => m.includes('writes disabled')).length,
    ).to.equal(1);
  });
});
