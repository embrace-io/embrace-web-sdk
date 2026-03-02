import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import type { PageManager, Route } from '../../index.ts';
import { ProxyPageManager } from '../../index.ts';
import type { PageAPIInstance } from './PageAPI.ts';
import { PageAPI } from './PageAPI.ts';

chai.use(sinonChai);
const { expect } = chai;

afterEach(() => {
  sinon.restore();
  PageAPI.resetInstance();
});

describe('PageAPI', () => {
  let pageAPI: PageAPIInstance;
  let mockRoute: Route;

  beforeEach(() => {
    pageAPI = PageAPI.getInstance();
    mockRoute = { path: '/products/:id', url: '/products/123' };
  });

  it('should return the same instance on multiple calls', () => {
    const pageAPIInstance1 = PageAPI.getInstance();
    const pageAPIInstance2 = PageAPI.getInstance();
    expect(pageAPIInstance1).to.equal(pageAPIInstance2);
  });

  it('should return an instance of ProxyPageManager for getPageManager', () => {
    const pageManager = pageAPI.getPageManager();
    expect(pageManager).to.be.instanceOf(ProxyPageManager);
  });

  it('should set and get the global page manager', () => {
    const mockPageManager: PageManager = {
      setCurrentRoute: sinon.stub(),
      getCurrentRoute: sinon.stub().returns(mockRoute),
      getCurrentPageId: sinon.stub().returns('test-page-id'),
      clearCurrentRoute: sinon.stub(),
      setPageLabel: sinon.stub(),
      getPageLabel: sinon.stub(),
    };
    pageAPI.setGlobalPageManager(mockPageManager);
    const pageManager = pageAPI.getPageManager();
    expect(pageManager).to.be.instanceOf(ProxyPageManager);
    expect((pageManager as ProxyPageManager).getDelegate()).to.equal(
      mockPageManager,
    );
  });

  it('should forward calls to the page manager', () => {
    const mockPageManager: PageManager = {
      setCurrentRoute: sinon.stub(),
      getCurrentRoute: sinon.stub().returns(mockRoute),
      getCurrentPageId: sinon.stub().returns('test-page-id'),
      clearCurrentRoute: sinon.stub(),
      setPageLabel: sinon.stub(),
      getPageLabel: sinon.stub(),
    };
    pageAPI.setGlobalPageManager(mockPageManager);

    pageAPI.setCurrentRoute(mockRoute);
    expect(mockPageManager.setCurrentRoute).to.have.been.calledOnceWith(
      mockRoute,
    );

    const route = pageAPI.getCurrentRoute();
    void expect(route).to.equal(mockRoute);
    void expect(mockPageManager.getCurrentRoute).to.have.been.calledOnce;

    const pageId = pageAPI.getCurrentPageId();
    expect(pageId).to.equal('test-page-id');
    void expect(mockPageManager.getCurrentPageId).to.have.been.calledOnce;

    pageAPI.clearCurrentRoute();
    void expect(mockPageManager.clearCurrentRoute).to.have.been.calledOnce;
  });
});
