import * as chai from 'chai';
import { toSafeString } from './toSafeString.ts';

const { expect } = chai;

describe('toSafeString', () => {
  it('matches String() for values it can convert', () => {
    for (const value of ['a', 1, true, [1, 'b'], { a: 1 }, Symbol('s')]) {
      expect(toSafeString(value)).to.equal(String(value));
    }
  });

  it('falls back for values without a string conversion', () => {
    expect(toSafeString(Object.create(null))).to.equal('[object Object]');
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(toSafeString(proxy)).to.equal('');
  });
});
