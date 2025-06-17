import { expect } from 'chai';
import { NoOpUserManager } from './NoOpUserManager.js';

describe('NoOpUserManager', () => {
  let noOpUserManager: NoOpUserManager;

  beforeEach(() => {
    noOpUserManager = new NoOpUserManager();
  });

  it('should return null for getUser', () => {
    const userId: string | null = noOpUserManager.getUserId();
    void expect(userId).to.be.null;
  });

  it('should do nothing for setUser', () => {
    void expect(() => {
      noOpUserManager.setUserId();
    }).to.not.throw();
  });

  it('should do nothing for clearUser', () => {
    expect(() => {
      noOpUserManager.clearUserId();
    }).to.not.throw();
  });
});
