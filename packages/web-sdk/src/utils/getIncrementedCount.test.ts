import * as chai from 'chai';
import { FailingStorage } from '../../tests/utils/FailingStorage.ts';
import { InMemoryDiagLogger } from '../../tests/utils/InMemoryDiagLogger.ts';
import { setupTestStorage } from '../../tests/utils/setupTestStorage.ts';
import { getIncrementedCount } from './getIncrementedCount.ts';
import { NamespacedStorage } from './NamespacedStorage/NamespacedStorage.ts';

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

  it('should return 1 when storage is unavailable', () => {
    const storage = new NamespacedStorage({
      storage: new FailingStorage(),
      diag,
    });

    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);
    expect(getIncrementedCount(storage, 'my-key', diag)).to.equal(1);

    // Wrapper warns once per failed read; setItem error logs only once.
    expect(
      diag.getWarnLogs().filter((m) => m.includes('failed to read my-key'))
        .length,
    ).to.equal(2);
    expect(
      diag.getErrorLogs().filter((m) => m.includes('writes disabled')).length,
    ).to.equal(1);
  });
});
