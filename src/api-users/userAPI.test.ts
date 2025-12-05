import { expect } from 'chai';
import { EmbraceUserManager } from '../managers/index.ts';
import { UserAPI } from './api/index.ts';
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
      manager = new EmbraceUserManager();
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
