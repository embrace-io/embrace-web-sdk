import * as chai from 'chai';
import { generateUUID } from './generateUUID.js';

const { expect } = chai;

describe('generateUUID', () => {
  it('should generate a UUID without hyphens', () => {
    const uuid = generateUUID();
    expect(uuid).to.not.include('-');
  });

  it('should generate a UUID in uppercase', () => {
    const uuid = generateUUID();
    expect(uuid).to.equal(uuid.toUpperCase());
  });

  it('should generate a UUID with correct length', () => {
    const uuid = generateUUID();
    // UUID v4 without hyphens is 32 characters long
    expect(uuid).to.have.lengthOf(32);
  });

  it('should generate different UUIDs on subsequent calls', () => {
    const uuid1 = generateUUID();
    const uuid2 = generateUUID();
    expect(uuid1).to.not.equal(uuid2);
  });
});
