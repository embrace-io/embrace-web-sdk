import { expect } from 'chai';
import { UserAPI } from './api/index.js';
import { user } from './userAPI.js';

describe('userAPI', () => {
  it('should export an instance of UserAPI', () => {
    expect(user).to.be.instanceOf(UserAPI);
  });

  it('should return the same instance on multiple calls', () => {
    const userInstance1 = user;
    const userInstance2 = UserAPI.getInstance();
    expect(userInstance1).to.equal(userInstance2);
  });
});
