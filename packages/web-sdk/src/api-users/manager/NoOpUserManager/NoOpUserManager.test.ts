import { expect } from 'chai';
import { NoOpUserManager } from './NoOpUserManager.ts';

describe('NoOpUserManager', () => {
  let noOpUserManager: NoOpUserManager;

  beforeEach(() => {
    noOpUserManager = new NoOpUserManager();
  });

  it('should return an empty string for getEmbraceUserId', () => {
    const embraceUserId: string = noOpUserManager.getEmbraceUserId();
    void expect(embraceUserId).to.equal('');
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
