import * as chai from 'chai';
import {
  blockWindowStorage,
  InMemoryDiagLogger,
} from '../../tests/utils/index.ts';
import { getWindowStorageWithInMemoryFallback } from './getWindowStorageWithInMemoryFallback.ts';
import { InMemoryStorage } from './InMemoryStorage/index.ts';

const { expect } = chai;

describe('getWindowStorageWithInMemoryFallback', () => {
  let diag: InMemoryDiagLogger;
  let restoreStorage: (() => void) | undefined;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
  });

  afterEach(() => {
    restoreStorage?.();
    restoreStorage = undefined;
  });

  it('returns the browser storage when the page can access it', () => {
    expect(getWindowStorageWithInMemoryFallback('localStorage', diag)).to.equal(
      window.localStorage,
    );
    expect(
      getWindowStorageWithInMemoryFallback('sessionStorage', diag),
    ).to.equal(window.sessionStorage);
    expect(diag.getWarnLogs()).to.have.lengthOf(0);
  });

  for (const name of ['localStorage', 'sessionStorage'] as const) {
    it(`falls back to in-memory storage when reading ${name} throws`, () => {
      restoreStorage = blockWindowStorage(name);

      expect(getWindowStorageWithInMemoryFallback(name, diag)).to.be.instanceOf(
        InMemoryStorage,
      );
      expect(diag.getWarnLogs()).to.deep.equal([
        `${name} is not accessible; keeping its data in memory for this page`,
      ]);
    });

    it(`falls back to in-memory storage when ${name} is null`, () => {
      restoreStorage = blockWindowStorage(name, 'null');

      expect(getWindowStorageWithInMemoryFallback(name, diag)).to.be.instanceOf(
        InMemoryStorage,
      );
      expect(diag.getWarnLogs()).to.deep.equal([
        `${name} is not accessible; keeping its data in memory for this page`,
      ]);
    });
  }
});
