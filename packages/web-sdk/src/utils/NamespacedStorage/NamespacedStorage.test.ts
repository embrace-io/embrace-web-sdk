import type { DiagLogger } from '@opentelemetry/api';
import * as chai from 'chai';
import {
  FailingStorage,
  InMemoryDiagLogger,
  InMemoryStorage,
} from '../../../tests/utils/index.ts';
import { NamespacedStorage } from './NamespacedStorage.ts';

const { expect } = chai;

describe('NamespacedStorage', () => {
  let inMemoryStorage: InMemoryStorage;

  beforeEach(() => {
    inMemoryStorage = new InMemoryStorage();
  });

  it('should set and get values using a prefix on the key', () => {
    const storage = new NamespacedStorage({
      namespace: 'prefix',
      storage: inMemoryStorage,
    });

    storage.setItem('key1', 'foo');
    storage.setItem('key2', 'bar');
    inMemoryStorage.setItem('key1', 'baz');
    inMemoryStorage.setItem('key3', 'bat');

    expect(storage.getItem('key1')).to.equal('foo');
    expect(storage.getItem('key2')).to.equal('bar');
    expect(storage.getItem('key3')).to.equal(null);

    expect(inMemoryStorage.getItem('key1')).to.equal('baz');
    expect(inMemoryStorage.getItem('prefix_key1')).to.equal('foo');
    expect(inMemoryStorage.getItem('key2')).to.equal(null);
    expect(inMemoryStorage.getItem('prefix_key2')).to.equal('bar');
    expect(inMemoryStorage.getItem('key3')).to.equal('bat');
    expect(inMemoryStorage.getItem('prefix_key3')).to.equal(null);
  });

  it('should remove items using a prefix on the key', () => {
    const storage = new NamespacedStorage({
      namespace: 'prefix',
      storage: inMemoryStorage,
    });

    storage.setItem('key1', 'foo');
    inMemoryStorage.setItem('key1', 'baz');
    inMemoryStorage.setItem('key2', 'bat');

    storage.removeItem('key1');
    storage.removeItem('key2');

    expect(storage.getItem('key1')).to.equal(null);
    expect(storage.getItem('key2')).to.equal(null);
    expect(inMemoryStorage.getItem('key1')).to.equal('baz');
    expect(inMemoryStorage.getItem('prefix_key1')).to.equal(null);
    expect(inMemoryStorage.getItem('key2')).to.equal('bat');
    expect(inMemoryStorage.getItem('prefix_key2')).to.equal(null);
  });

  it('should return keys that match the prefix', () => {
    const storage = new NamespacedStorage({
      namespace: 'prefix',
      storage: inMemoryStorage,
    });

    storage.setItem('key1', 'foo');
    inMemoryStorage.setItem('key3', 'baz');
    storage.setItem('key2', 'bar');
    inMemoryStorage.setItem('key4', 'bat');

    expect(storage.length).to.equal(2);
    expect(storage.key(0)).to.equal('key1');
    expect(storage.key(1)).to.equal('key2');

    expect(inMemoryStorage.length).to.equal(4);
    expect(inMemoryStorage.key(0)).to.equal('prefix_key1');
    expect(inMemoryStorage.key(1)).to.equal('key3');
    expect(inMemoryStorage.key(2)).to.equal('prefix_key2');
    expect(inMemoryStorage.key(3)).to.equal('key4');
  });

  it('should clear keys that match the prefix', () => {
    const storage = new NamespacedStorage({
      namespace: 'prefix',
      storage: inMemoryStorage,
    });

    storage.setItem('key1', 'foo');
    inMemoryStorage.setItem('key3', 'baz');
    storage.setItem('key2', 'bar');
    inMemoryStorage.setItem('key4', 'bat');

    storage.clear();

    expect(storage.length).to.equal(0);
    expect(storage.key(0)).to.equal(null);
    expect(storage.key(1)).to.equal(null);
    expect(storage.getItem('key1')).to.equal(null);
    expect(storage.getItem('key2')).to.equal(null);

    expect(inMemoryStorage.length).to.equal(2);
    expect(inMemoryStorage.key(0)).to.equal('key3');
    expect(inMemoryStorage.key(1)).to.equal('key4');
  });

  describe('without a namespace prefix', () => {
    it('stores keys without a prefix when the namespace is omitted', () => {
      const storage = new NamespacedStorage({
        storage: inMemoryStorage,
      });

      storage.setItem('key1', 'foo');
      inMemoryStorage.setItem('key2', 'bar');

      expect(storage.getItem('key1')).to.equal('foo');
      expect(storage.getItem('key2')).to.equal('bar');
      expect(inMemoryStorage.getItem('key1')).to.equal('foo');
      expect(inMemoryStorage.getItem('_key1')).to.equal(null);

      expect(storage.length).to.equal(2);
      expect([storage.key(0), storage.key(1)].sort()).to.deep.equal([
        'key1',
        'key2',
      ]);
    });

    it('stores keys without a prefix when the namespace is an empty string', () => {
      const storage = new NamespacedStorage({
        namespace: '',
        storage: inMemoryStorage,
      });

      storage.setItem('key1', 'foo');
      inMemoryStorage.setItem('key2', 'bar');

      expect(storage.getItem('key1')).to.equal('foo');
      expect(storage.getItem('key2')).to.equal('bar');
      expect(inMemoryStorage.getItem('key1')).to.equal('foo');
      expect(inMemoryStorage.getItem('_key1')).to.equal(null);

      expect(storage.length).to.equal(2);
      expect([storage.key(0), storage.key(1)].sort()).to.deep.equal([
        'key1',
        'key2',
      ]);
    });
  });

  describe('error handling', () => {
    let diagLogger: InMemoryDiagLogger;

    beforeEach(() => {
      diagLogger = new InMemoryDiagLogger();
    });

    it('returns null and warns when getItem throws', () => {
      const storage = new NamespacedStorage({
        namespace: 'prefix',
        storage: new FailingStorage(),
        diag: diagLogger,
      });

      expect(storage.getItem('foo')).to.equal(null);
      expect(diagLogger.getWarnLogs()).to.have.lengthOf(1);
      expect(diagLogger.getWarnLogs()[0]).to.contain('foo');
    });

    it('returns 0 length and warns when storage.length throws', () => {
      const storage = new NamespacedStorage({
        namespace: 'prefix',
        storage: new FailingStorage(),
        diag: diagLogger,
      });

      expect(storage.length).to.equal(0);
      expect(storage.key(0)).to.equal(null);
      expect(diagLogger.getWarnLogs().some((m) => m.includes('length'))).to.be
        .true;
    });

    it('swallows removeItem failure and warns', () => {
      const storage = new NamespacedStorage({
        namespace: 'prefix',
        storage: new FailingStorage(),
        diag: diagLogger,
      });

      expect(() => {
        storage.removeItem('foo');
      }).to.not.throw();
      expect(diagLogger.getWarnLogs().some((m) => m.includes('prefix_foo'))).to
        .be.true;
    });

    it('swallows setItem failure and disables further writes after the first', () => {
      let setCalls = 0;
      const failingWrites: Storage = {
        get length() {
          return 0;
        },
        clear: () => undefined,
        getItem: () => null,
        key: () => null,
        removeItem: () => undefined,
        setItem: () => {
          setCalls++;
          throw new Error('QuotaExceeded');
        },
      };
      const storage = new NamespacedStorage({
        namespace: 'prefix',
        storage: failingWrites,
        diag: diagLogger,
      });

      expect(() => {
        storage.setItem('a', '1');
      }).to.not.throw();
      expect(() => {
        storage.setItem('b', '2');
      }).to.not.throw();
      expect(() => {
        storage.setItem('c', '3');
      }).to.not.throw();

      expect(setCalls).to.equal(1);
      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
    });

    it('keeps reads, removes, and clears working after writes are disabled', () => {
      inMemoryStorage.setItem('prefix_kept', 'value');
      inMemoryStorage.setItem('prefix_removed', 'gone');

      let allowWrites = true;
      const flakyStorage: Storage = {
        get length() {
          return inMemoryStorage.length;
        },
        clear: () => {
          inMemoryStorage.clear();
        },
        getItem: (k) => inMemoryStorage.getItem(k),
        key: (i) => inMemoryStorage.key(i),
        removeItem: (k) => {
          inMemoryStorage.removeItem(k);
        },
        setItem: (k, v) => {
          if (!allowWrites) {
            throw new Error('QuotaExceeded');
          }
          inMemoryStorage.setItem(k, v);
        },
      };
      const storage = new NamespacedStorage({
        namespace: 'prefix',
        storage: flakyStorage,
        diag: diagLogger,
      });

      allowWrites = false;
      storage.setItem('attempt', 'value');
      storage.setItem('also-attempt', 'value');

      expect(storage.getItem('kept')).to.equal('value');

      storage.removeItem('removed');
      expect(storage.getItem('removed')).to.equal(null);

      inMemoryStorage.setItem('prefix_for_clear', 'value');
      storage.clear();
      expect(storage.length).to.equal(0);

      expect(diagLogger.getErrorLogs()).to.have.lengthOf(1);
      expect(diagLogger.getWarnLogs()).to.have.lengthOf(0);
    });

    it('continues iterating when storage.key(i) throws for some indices', () => {
      const partialKeyFail: Storage = {
        get length() {
          return 3;
        },
        clear: () => undefined,
        getItem: () => null,
        key: (i) => {
          if (i === 0) return 'prefix_a';
          if (i === 2) return 'prefix_b';
          throw new Error('reading-prevented');
        },
        removeItem: () => undefined,
        setItem: () => undefined,
      };
      const storage = new NamespacedStorage({
        namespace: 'prefix',
        storage: partialKeyFail,
        diag: diagLogger,
      });

      expect(storage.length).to.equal(2);
      expect([storage.key(0), storage.key(1)].sort()).to.deep.equal(['a', 'b']);
      expect(diagLogger.getWarnLogs()).to.not.be.empty;
      expect(diagLogger.getWarnLogs().every((m) => m.includes('index 1'))).to.be
        .true;
    });

    it('logs only the error name on setItem failure, not the value', () => {
      const value = 'sensitive-payload';
      const errorCalls: unknown[][] = [];
      const captureLogger: DiagLogger = {
        debug: () => undefined,
        error: (...callArgs) => {
          errorCalls.push(callArgs);
        },
        info: () => undefined,
        verbose: () => undefined,
        warn: () => undefined,
      };
      const failingWrites: Storage = {
        get length() {
          return 0;
        },
        clear: () => undefined,
        getItem: () => null,
        key: () => null,
        removeItem: () => undefined,
        setItem: () => {
          const e = new Error(`quota exceeded while writing ${value}`);
          e.name = 'QuotaExceededError';
          throw e;
        },
      };
      const storage = new NamespacedStorage({
        namespace: 'prefix',
        storage: failingWrites,
        diag: captureLogger,
      });

      storage.setItem('k', value);

      expect(errorCalls).to.have.lengthOf(1);
      const flat = errorCalls[0].map(String).join(' ');
      expect(flat).to.contain('QuotaExceededError');
      expect(flat).to.not.contain(value);
    });

    it('swallows clear() failure when underlying removeItem throws', () => {
      inMemoryStorage.setItem('prefix_a', '1');
      inMemoryStorage.setItem('prefix_b', '2');

      const removeFails: Storage = {
        get length() {
          return inMemoryStorage.length;
        },
        clear: () => {
          inMemoryStorage.clear();
        },
        getItem: (k) => inMemoryStorage.getItem(k),
        key: (i) => inMemoryStorage.key(i),
        removeItem: () => {
          throw new Error('locked');
        },
        setItem: (k, v) => {
          inMemoryStorage.setItem(k, v);
        },
      };
      const storage = new NamespacedStorage({
        namespace: 'prefix',
        storage: removeFails,
        diag: diagLogger,
      });

      expect(() => {
        storage.clear();
      }).to.not.throw();
      expect(diagLogger.getWarnLogs()).to.have.lengthOf(2);
      expect(diagLogger.getWarnLogs().every((m) => m.includes('prefix_'))).to.be
        .true;
    });
  });
});
