import * as chai from 'chai';
import { generateWebVitalID } from './generateWebVitalID.ts';

const { expect } = chai;

describe('generateWebVitalID', () => {
  it('should generate an id with the embracev2 prefix', () => {
    const id = generateWebVitalID();
    expect(id).to.match(/^embracev2-/);
  });

  it('should generate different ids on subsequent calls', () => {
    const id1 = generateWebVitalID();
    const id2 = generateWebVitalID();
    expect(id1).to.not.equal(id2);
  });

  it('should contain a timestamp and random component', () => {
    const id = generateWebVitalID();
    const parts = id.split('-');
    // format: v5-<timestamp>-<random>
    expect(parts).to.have.lengthOf(3);
    expect(Number(parts[1])).to.be.a('number').and.greaterThan(0);
    expect(Number(parts[2])).to.be.a('number').and.greaterThan(0);
  });

  it('should generate a random component within the expected range', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateWebVitalID();
      const random = Number(id.split('-')[2]);
      expect(random).to.be.greaterThanOrEqual(1e12);
      expect(random).to.be.lessThan(1e13);
    }
  });
});
