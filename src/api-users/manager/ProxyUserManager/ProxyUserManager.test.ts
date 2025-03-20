import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { KEY_ENDUSER_PSEUDO_ID } from '../constants/index.js';
import { NoOpUserManager } from '../NoOpUserManager/index.js';
import type { User, UserManager } from '../types.js';
import { ProxyUserManager } from './ProxyUserManager.js';

chai.use(sinonChai);
const { expect } = chai;
describe('ProxyUserManager', () => {
  let proxyUserManager: ProxyUserManager;
  let mockDelegate: UserManager;

  beforeEach(() => {
    proxyUserManager = new ProxyUserManager();
    mockDelegate = {
      getUser: sinon
        .stub()
        .returns({ [KEY_ENDUSER_PSEUDO_ID]: 'mockUserId' } as User),
      setUser: sinon.stub(),
      clearUser: sinon.stub()
    };
  });

  it('should return NoOpUserManager as default delegate', () => {
    const delegate = proxyUserManager.getDelegate();
    expect(delegate).to.be.instanceOf(NoOpUserManager);
  });

  it('should set and get the delegate', () => {
    proxyUserManager.setDelegate(mockDelegate);
    const delegate = proxyUserManager.getDelegate();
    expect(delegate).to.equal(mockDelegate);
  });

  it('should delegate getUser to the delegate', () => {
    proxyUserManager.setDelegate(mockDelegate);
    const user = proxyUserManager.getUser();
    expect(user).to.deep.equal({ [KEY_ENDUSER_PSEUDO_ID]: 'mockUserId' });
  });

  it('should delegate setUser to the delegate', () => {
    const user: User = { [KEY_ENDUSER_PSEUDO_ID]: 'newUserId' };
    proxyUserManager.setDelegate(mockDelegate);
    proxyUserManager.setUser(user);
    expect(mockDelegate.setUser).to.have.been.calledOnceWith(user);
  });

  it('should delegate clearUser to the delegate', () => {
    proxyUserManager.setDelegate(mockDelegate);
    proxyUserManager.clearUser();
    void expect(mockDelegate.clearUser).to.have.been.calledOnce;
  });
});
