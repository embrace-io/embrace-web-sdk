import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../tests/utils/index.ts';
import { getIncrementedCount } from './getIncrementedCount.ts';
import { SafeStorage } from './SafeStorage/index.ts';

const { expect } = chai;

describe('getIncrementedCount', () => {
  let diag: InMemoryDiagLogger;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
  });

  it('should return an incremented count after each call', () => {
    const inMemoryStorage = new InMemoryStorage();
    const storage = new SafeStorage(inMemoryStorage, diag);

    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(2);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(3);

    inMemoryStorage.clear();
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
  });

  it('should fall back to in-memory counter when storage is unavailable', () => {
    const storage = new SafeStorage(new FailingStorage(), diag);

    // Read returns null (warns), write fails (flips disabled and emits one error).
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
    // Subsequent calls keep returning 1 (no storage state survives).
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);

    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('Storage write failed');
    // Each read still warns; only writes are silenced after disable.
    expect(
      diag.getWarnLogs().every((m) => m.includes('Failed to read')),
    ).to.equal(true);
  });
});
