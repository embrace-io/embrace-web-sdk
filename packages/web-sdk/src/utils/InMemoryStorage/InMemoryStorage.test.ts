import * as chai from 'chai';
import { InMemoryStorage } from './InMemoryStorage.ts';

const { expect } = chai;

describe('InMemoryStorage', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
  });

  it('returns null for a key that was never set', () => {
    void expect(storage.getItem('missing')).to.be.null;
  });

  it('stores, replaces and removes values', () => {
    storage.setItem('key', 'first');
    storage.setItem('key', 'second');
    expect(storage.getItem('key')).to.equal('second');

    storage.removeItem('key');
    void expect(storage.getItem('key')).to.be.null;
  });

  it('treats keys that match Object.prototype members as ordinary keys', () => {
    void expect(storage.getItem('toString')).to.be.null;

    storage.setItem('toString', 'value');
    expect(storage.getItem('toString')).to.equal('value');
  });

  it('lists keys by index and reports the number of entries', () => {
    storage.setItem('one', '1');
    storage.setItem('two', '2');

    expect(storage.length).to.equal(2);
    expect(storage.key(0)).to.equal('one');
    expect(storage.key(1)).to.equal('two');
    void expect(storage.key(2)).to.be.null;
  });

  it('clears every entry', () => {
    storage.setItem('one', '1');
    storage.setItem('two', '2');

    storage.clear();

    expect(storage.length).to.equal(0);
    void expect(storage.getItem('one')).to.be.null;
  });
});
