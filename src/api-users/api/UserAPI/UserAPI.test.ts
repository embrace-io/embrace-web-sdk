import * as chai from 'chai';
import * as sinon from 'sinon';
import type { UserManager } from '../../manager/index.js';
import {
  KEY_ENDUSER_PSEUDO_ID,
  ProxyUserManager,
} from '../../manager/index.js';
import { UserAPI } from './UserAPI.js';
import sinonChai from 'sinon-chai';

chai.use(sinonChai);
const { expect } = chai;

describe('UserAPI', () => {
  let userAPI: UserAPI;

  beforeEach(() => {
    userAPI = UserAPI.getInstance();
  });

  it('should return an instance of UserAPI', () => {
    expect(userAPI).to.be.instanceOf(UserAPI);
  });

  it('should return the same instance on multiple calls', () => {
    const userAPIInstance1 = UserAPI.getInstance();
    const userAPIInstance2 = UserAPI.getInstance();
    expect(userAPIInstance1).to.equal(userAPIInstance2);
  });

  it('should return an instance of ProxyUserManager for getUserManager', () => {
    const userManager = userAPI.getUserManager();
    expect(userManager).to.be.instanceOf(ProxyUserManager);
  });

  it('should set and get the global user manager', () => {
    const mockUserManager: UserManager = {
      // Mock implementation of UserManager
      getUser: sinon.stub().returns({ id: 'mockUserId' }),
      setUser: sinon.stub(),
      clearUser: sinon.stub(),
    };
    userAPI.setGlobalUserManager(mockUserManager);
    const userManager = userAPI.getUserManager();
    expect(userManager).to.be.instanceOf(ProxyUserManager);
    expect((userManager as ProxyUserManager).getDelegate()).to.equal(
      mockUserManager
    );
  });

  it('should forward calls to the user manager', () => {
    const mockUserManager: UserManager = {
      // Mock implementation of UserManager
      getUser: sinon.stub().returns({ id: 'mockUserId' }),
      setUser: sinon.stub(),
      clearUser: sinon.stub(),
    };
    userAPI.setGlobalUserManager(mockUserManager);

    void expect(userAPI.getUser()).to.not.be.null;
    void expect(mockUserManager.getUser).to.have.been.calledOnce;

    const user = { [KEY_ENDUSER_PSEUDO_ID]: 'newUserId' };
    userAPI.setUser(user);
    expect(mockUserManager.setUser).to.have.been.calledOnceWith(user);

    userAPI.clearUser();
    void expect(mockUserManager.clearUser).to.have.been.calledOnce;
  });
});
