import { expect } from 'chai';
import type { User } from '../types.js';
import { NoOpUserManager } from './NoOpUserManager.js';

describe('NoOpUserManager', () => {
  let noOpUserManager: NoOpUserManager;

  beforeEach(() => {
    noOpUserManager = new NoOpUserManager();
  });

  it('should return null for getUser', () => {
    const user: User | null = noOpUserManager.getUser();
    void expect(user).to.be.null;
  });

  it('should do nothing for setUser', () => {
    void expect(() => {
      noOpUserManager.setUser();
    }).to.not.throw();
  });

  it('should do nothing for clearUser', () => {
    expect(() => {
      noOpUserManager.clearUser();
    }).to.not.throw();
  });
});
