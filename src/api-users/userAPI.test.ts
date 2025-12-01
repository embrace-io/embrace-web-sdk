import { expect } from 'chai';
import { UserAPI } from './api/index.js';
import { user } from './userAPI.js';

describe('userAPI', () => {
  it('should export a user instance with expected methods', () => {
    expect(user).to.have.property('getUserId');
    expect(user).to.have.property('setUserId');
    expect(user).to.have.property('setGlobalUserManager');
  });

  it('should return the same instance on multiple calls', () => {
    const userInstance1 = user;
    const userInstance2 = UserAPI.getInstance();
    expect(userInstance1).to.equal(userInstance2);
  });
});
