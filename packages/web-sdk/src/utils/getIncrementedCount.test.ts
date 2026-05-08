import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../tests/utils/index.ts';
import { EmbraceStorage } from './EmbraceStorage/index.ts';
import { getIncrementedCount } from './getIncrementedCount.ts';

const { expect } = chai;

describe('getIncrementedCount', () => {
  let diag: InMemoryDiagLogger;
  let inMemoryStorage: InMemoryStorage;
  let storage: EmbraceStorage;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    inMemoryStorage = new InMemoryStorage();
    storage = new EmbraceStorage(inMemoryStorage, diag);
  });

  it('should return an incremented count after each call', () => {
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(2);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(3);

    storage.clear();
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
  });

  it('should return 1 when storage is unavailable', () => {
    const storage = new EmbraceStorage(new FailingStorage(), diag);

    // Read returns null (warns), write fails (flips disabled and emits one error).
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
    // Subsequent calls keep returning 1 (no storage state survives).
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);

    expect(diag.getErrorLogs()).to.have.lengthOf(1);
    expect(diag.getErrorLogs()[0]).to.contain('Storage write failed');
    expect(
      diag.getWarnLogs().some((m) => m.includes('Failed to read')),
    ).to.equal(true);
    expect(
      diag.getWarnLogs().some((m) => m.includes("Counter 'my-key'")),
    ).to.equal(true);
  });
});
