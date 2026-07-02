import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { NoOpUserManager } from '../NoOpUserManager/NoOpUserManager.ts';
import type { UserManager } from '../types.ts';
import { ProxyUserManager } from './ProxyUserManager.ts';

chai.use(sinonChai);
const { expect } = chai;
describe('ProxyUserManager', () => {
  let proxyUserManager: ProxyUserManager;
  let mockDelegate: UserManager;

  beforeEach(() => {
    proxyUserManager = new ProxyUserManager();
    mockDelegate = {
      getEmbraceUserId: sinon.stub().returns('mockEmbraceUserId'),
      getUserId: sinon.stub().returns('mockUserId'),
      setUserId: sinon.stub(),
      clearUserId: sinon.stub(),
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

  it('should delegate getEmbraceUserId to the delegate', () => {
    proxyUserManager.setDelegate(mockDelegate);
    const embraceUserId = proxyUserManager.getEmbraceUserId();
    expect(embraceUserId).to.equal('mockEmbraceUserId');
  });

  it('should delegate getUser to the delegate', () => {
    proxyUserManager.setDelegate(mockDelegate);
    const userId = proxyUserManager.getUserId();
    expect(userId).to.deep.equal('mockUserId');
  });

  it('should delegate setUser to the delegate', () => {
    proxyUserManager.setDelegate(mockDelegate);
    proxyUserManager.setUserId('newUserId');
    expect(mockDelegate.setUserId).to.have.been.calledOnceWith('newUserId');
  });

  it('should delegate clearUser to the delegate', () => {
    proxyUserManager.setDelegate(mockDelegate);
    proxyUserManager.clearUserId();
    void expect(mockDelegate.clearUserId).to.have.been.calledOnce;
  });
});
