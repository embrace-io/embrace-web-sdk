import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { UserManager } from '../../manager/index.js';
import { ProxyUserManager } from '../../manager/index.js';
import { UserAPI } from './UserAPI.js';

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
      getEmbraceUserId: sinon.stub().returns('mockEmbraceUserId'),
      getUserId: sinon.stub().returns('mockUserId'),
      setUserId: sinon.stub(),
      clearUserId: sinon.stub(),
    };
    userAPI.setGlobalUserManager(mockUserManager);
    const userManager = userAPI.getUserManager();
    expect(userManager).to.be.instanceOf(ProxyUserManager);
    expect((userManager as ProxyUserManager).getDelegate()).to.equal(
      mockUserManager,
    );
  });

  it('should forward calls to the user manager', () => {
    const mockUserManager: UserManager = {
      // Mock implementation of UserManager
      getEmbraceUserId: sinon.stub().returns('mockEmbraceUserId'),
      getUserId: sinon.stub().returns('mockUserId'),
      setUserId: sinon.stub(),
      clearUserId: sinon.stub(),
    };
    userAPI.setGlobalUserManager(mockUserManager);

    void expect(userAPI.getEmbraceUserId()).to.equal('mockEmbraceUserId');
    void expect(mockUserManager.getEmbraceUserId).to.have.been.calledOnce;

    void expect(userAPI.getUserId()).to.not.be.null;
    void expect(mockUserManager.getUserId).to.have.been.calledOnce;

    userAPI.setUserId('newUserId');
    expect(mockUserManager.setUserId).to.have.been.calledOnceWith('newUserId');

    userAPI.clearUserId();
    void expect(mockUserManager.clearUserId).to.have.been.calledOnce;
  });
});
