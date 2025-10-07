import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { PageManager, Route } from '../index.js';
import { NoOpPageManager } from '../NoOpPageManager/index.js';
import { ProxyPageManager } from './ProxyPageManager.js';

chai.use(sinonChai);
const { expect } = chai;

describe('ProxyPageManager', () => {
  let proxyPageManager: ProxyPageManager;
  let mockDelegate: PageManager;
  let mockRoute: Route;

  beforeEach(() => {
    proxyPageManager = new ProxyPageManager();
    mockRoute = { path: '/products/:id', url: '/products/123' };
    mockDelegate = {
      setCurrentRoute: sinon.stub(),
      getCurrentRoute: sinon.stub().returns(mockRoute),
      getCurrentPageId: sinon.stub().returns('test-page-id'),
    };
  });

  it('should return NoOpPageManager as default delegate', () => {
    const delegate = proxyPageManager.getDelegate();
    expect(delegate).to.be.instanceOf(NoOpPageManager);
  });

  it('should set and get the delegate', () => {
    proxyPageManager.setDelegate(mockDelegate);
    const delegate = proxyPageManager.getDelegate();
    expect(delegate).to.equal(mockDelegate);
  });

  it('should delegate setCurrentRoute to the delegate', () => {
    proxyPageManager.setDelegate(mockDelegate);
    proxyPageManager.setCurrentRoute(mockRoute);
    expect(mockDelegate.setCurrentRoute).to.have.been.calledOnceWith(mockRoute);
  });

  it('should delegate getCurrentRoute to the delegate', () => {
    proxyPageManager.setDelegate(mockDelegate);
    const route = proxyPageManager.getCurrentRoute();
    expect(route).to.equal(mockRoute);
    void expect(mockDelegate.getCurrentRoute).to.have.been.calledOnce;
  });

  it('should delegate getCurrentPageId to the delegate', () => {
    proxyPageManager.setDelegate(mockDelegate);
    const pageId = proxyPageManager.getCurrentPageId();
    expect(pageId).to.equal('test-page-id');
    void expect(mockDelegate.getCurrentPageId).to.have.been.calledOnce;
  });
});
