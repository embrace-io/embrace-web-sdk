import { expect } from 'chai';
import { UserAPI } from './api/index.ts';
import { user } from './userAPI.ts';

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
