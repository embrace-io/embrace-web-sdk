import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../../tests/utils/index.ts';
import { EmbraceStorage } from './EmbraceStorage.ts';

const { expect } = chai;

describe('EmbraceStorage', () => {
  let diag: InMemoryDiagLogger;
  let inMemoryStorage: InMemoryStorage;

  beforeEach(() => {
    diag = new InMemoryDiagLogger();
    inMemoryStorage = new InMemoryStorage();
  });

  describe('without namespace', () => {
    it('reads and writes raw keys', () => {
      const storage = new EmbraceStorage(inMemoryStorage, diag);

      expect(storage.setItem('key', 'value')).to.equal(true);

      expect(storage.getItem('key')).to.equal('value');
      expect(inMemoryStorage.getItem('key')).to.equal('value');
    });

    it('keys() returns all underlying keys', () => {
      inMemoryStorage.setItem('one', '1');
      inMemoryStorage.setItem('two', '2');
      const storage = new EmbraceStorage(inMemoryStorage, diag);

      expect(storage.keys()).to.deep.equal(['one', 'two']);
    });

    it('clear() removes every key from the underlying storage', () => {
      inMemoryStorage.setItem('one', '1');
      inMemoryStorage.setItem('two', '2');
      const storage = new EmbraceStorage(inMemoryStorage, diag);

      expect(storage.clear()).to.equal(true);

      expect(storage.keys()).to.deep.equal([]);
      expect(inMemoryStorage.length).to.equal(0);
    });
  });

  describe('with namespace', () => {
    it('prefixes physical keys but exposes logical keys to callers', () => {
      const storage = new EmbraceStorage(inMemoryStorage, diag, 'prefix');

      storage.setItem('key1', 'foo');
      storage.setItem('key2', 'bar');
      inMemoryStorage.setItem('key1', 'baz');
      inMemoryStorage.setItem('key3', 'bat');

      expect(storage.getItem('key1')).to.equal('foo');
      expect(storage.getItem('key2')).to.equal('bar');
      expect(storage.getItem('key3')).to.equal(null);

      expect(inMemoryStorage.getItem('key1')).to.equal('baz');
      expect(inMemoryStorage.getItem('prefix_key1')).to.equal('foo');
      expect(inMemoryStorage.getItem('prefix_key2')).to.equal('bar');
      expect(inMemoryStorage.getItem('key3')).to.equal('bat');
    });

    it('removeItem deletes only the namespaced physical key', () => {
      const storage = new EmbraceStorage(inMemoryStorage, diag, 'prefix');

      storage.setItem('key1', 'foo');
      inMemoryStorage.setItem('key1', 'baz');

      expect(storage.removeItem('key1')).to.equal(true);

      expect(storage.getItem('key1')).to.equal(null);
      expect(inMemoryStorage.getItem('key1')).to.equal('baz');
      expect(inMemoryStorage.getItem('prefix_key1')).to.equal(null);
    });

    it('keys() and key(i) reflect the namespaced view, ignoring foreign keys', () => {
      const storage = new EmbraceStorage(inMemoryStorage, diag, 'prefix');

      storage.setItem('key1', 'foo');
      inMemoryStorage.setItem('key3', 'baz');
      storage.setItem('key2', 'bar');
      inMemoryStorage.setItem('key4', 'bat');

      expect(storage.keys()).to.deep.equal(['key1', 'key2']);
      expect(storage.key(0)).to.equal('key1');
      expect(storage.key(1)).to.equal('key2');
      expect(storage.key(2)).to.equal(null);

      expect(inMemoryStorage.length).to.equal(4);
    });

    it('clear() only removes namespaced keys, leaving foreign keys intact', () => {
      const storage = new EmbraceStorage(inMemoryStorage, diag, 'prefix');

      storage.setItem('key1', 'foo');
      inMemoryStorage.setItem('key3', 'baz');
      storage.setItem('key2', 'bar');
      inMemoryStorage.setItem('key4', 'bat');

      storage.clear();

      expect(storage.keys()).to.deep.equal([]);
      expect(inMemoryStorage.length).to.equal(2);
      expect(inMemoryStorage.getItem('key3')).to.equal('baz');
      expect(inMemoryStorage.getItem('key4')).to.equal('bat');
    });

    it('preserves an empty-string logical key without coercing to null', () => {
      const storage = new EmbraceStorage(inMemoryStorage, diag, 'prefix');

      storage.setItem('', 'empty-key-value');

      expect(inMemoryStorage.getItem('prefix_')).to.equal('empty-key-value');
      expect(storage.getItem('')).to.equal('empty-key-value');
      expect(storage.key(0)).to.equal('');
      expect(storage.keys()).to.deep.equal(['']);
    });
  });

  describe('error handling', () => {
    it('returns null and warns when read fails', () => {
      const storage = new EmbraceStorage(new FailingStorage(), diag);

      expect(storage.getItem('key')).to.equal(null);
      expect(diag.getWarnLogs()).to.have.lengthOf(1);
      expect(diag.getErrorLogs()).to.have.lengthOf(0);
      expect(storage.isWriteDisabled()).to.equal(false);
    });

    it('returns null on read miss without warning', () => {
      const storage = new EmbraceStorage(inMemoryStorage, diag);

      expect(storage.getItem('missing')).to.equal(null);
      expect(diag.getWarnLogs()).to.have.lengthOf(0);
    });

    it('flips to disabled and emits a single error on first write failure', () => {
      const storage = new EmbraceStorage(new FailingStorage(), diag);

      expect(storage.setItem('a', '1')).to.equal(false);

      expect(storage.isWriteDisabled()).to.equal(true);
      expect(diag.getErrorLogs()).to.have.lengthOf(1);
      expect(diag.getErrorLogs()[0]).to.contain('Storage write failed');
      expect(diag.getErrorLogs()[0]).to.contain('falling back to in-memory');
    });

    it('silences subsequent write failures after disable', () => {
      const storage = new EmbraceStorage(new FailingStorage(), diag);

      expect(storage.setItem('a', '1')).to.equal(false);
      expect(storage.setItem('b', '2')).to.equal(false);
      expect(storage.setItem('c', '3')).to.equal(false);

      expect(diag.getErrorLogs()).to.have.lengthOf(1);
    });

    it('disables writes when setItem throws a non-Error value', () => {
      const nonErrorThrowingStorage: Storage = {
        get length() {
          return 0;
        },
        clear() {
          return;
        },
        getItem() {
          return null;
        },
        key() {
          return null;
        },
        removeItem() {
          return;
        },
        setItem() {
          // eslint-disable-next-line no-throw-literal
          throw 'quota exceeded';
        },
      };
      const storage = new EmbraceStorage(nonErrorThrowingStorage, diag);

      expect(storage.setItem('a', '1')).to.equal(false);

      expect(storage.isWriteDisabled()).to.equal(true);
      expect(diag.getErrorLogs()).to.have.lengthOf(1);
      expect(diag.getErrorLogs()[0]).to.contain('Storage write failed');
    });

    it('disables writes on TypeError from setItem', () => {
      const typeErrorStorage: Storage = {
        get length() {
          return 0;
        },
        clear() {
          return;
        },
        getItem() {
          return null;
        },
        key() {
          return null;
        },
        removeItem() {
          return;
        },
        setItem() {
          throw new TypeError('setItem rejected by storage');
        },
      };
      const storage = new EmbraceStorage(typeErrorStorage, diag);

      expect(storage.setItem('k', 'v')).to.equal(false);
      expect(storage.isWriteDisabled()).to.equal(true);
      expect(diag.getErrorLogs()).to.have.lengthOf(1);
      expect(diag.getErrorLogs()[0]).to.contain('Storage write failed');

      expect(storage.setItem('k2', 'v2')).to.equal(false);
      expect(storage.isWriteDisabled()).to.equal(true);
      expect(diag.getErrorLogs()).to.have.lengthOf(1);
    });

    it('removeItem warns on failure without disabling writes', () => {
      const storage = new EmbraceStorage(new FailingStorage(), diag);

      expect(storage.removeItem('k')).to.equal(false);

      expect(
        diag.getWarnLogs().some((m) => m.includes('Failed to remove')),
      ).to.equal(true);
      expect(storage.isWriteDisabled()).to.equal(false);
    });

    it('clear() returns false when an underlying remove fails, but continues iterating', () => {
      let removeCalls = 0;
      const partialStorage: Storage = {
        get length() {
          return 2;
        },
        clear() {
          return;
        },
        getItem() {
          return null;
        },
        key(index: number) {
          return index === 0 ? 'a' : 'b';
        },
        removeItem(key: string) {
          removeCalls++;
          if (key === 'a') {
            throw new Error('cannot remove a');
          }
        },
        setItem() {
          return;
        },
      };
      const storage = new EmbraceStorage(partialStorage, diag);

      expect(storage.clear()).to.equal(false);
      expect(removeCalls).to.equal(2);
      expect(storage.isWriteDisabled()).to.equal(false);
    });

    it('keys() returns empty array when length throws', () => {
      const storage = new EmbraceStorage(new FailingStorage(), diag);

      expect(storage.keys()).to.deep.equal([]);
      expect(diag.getWarnLogs()).to.have.lengthOf(1);
    });

    it('keys() skips poisoned indices', () => {
      let callCount = 0;
      const poisoned: Storage = {
        get length() {
          return 3;
        },
        clear() {
          return;
        },
        getItem() {
          return null;
        },
        key(index: number) {
          callCount++;
          if (index === 1) {
            throw new Error('poisoned');
          }
          return `k${index.toString()}`;
        },
        removeItem() {
          return;
        },
        setItem() {
          return;
        },
      };
      const storage = new EmbraceStorage(poisoned, diag);

      expect(storage.keys()).to.deep.equal(['k0', 'k2']);
      expect(callCount).to.equal(3);
      expect(diag.getWarnLogs()).to.have.lengthOf(1);
    });
  });
});
