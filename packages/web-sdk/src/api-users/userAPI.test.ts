import { expect } from 'chai';
import { setupTestStorage } from '../../tests/utils/setupTestStorage.ts';
import { EmbraceUserManager } from '../managers/EmbraceUserManager/EmbraceUserManager.ts';
import { UserAPI } from './api/UserAPI/UserAPI.ts';
import { user } from './userAPI.ts';

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

  describe('incorrect usage', () => {
    let manager: EmbraceUserManager;

    type IncorrectUsageTest = {
      name: string;
      invocation: () => unknown;
    };

    const tests: IncorrectUsageTest[] = [
      {
        name: 'setUserId',
        // @ts-expect-error
        invocation: () => user.setUserId({ foo: 'bar' }),
      },
    ];

    beforeEach(() => {
      manager = new EmbraceUserManager({ storage: setupTestStorage() });
      user.setGlobalUserManager(manager);
    });

    tests.forEach((test) => {
      it(`${test.name} should handle incorrect usage`, async () => {
        expect(() => {
          test.invocation();
        }).to.not.throw();
      });
    });
  });
});
