import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { getNavigationInstrumentation } from '../../index.js';
import type { Router, RouterState } from './types.js';
import { listenToRouterChanges } from './listenToRouterChanges.js';

chai.use(sinonChai);

const { expect } = chai;

describe('listenToRouterChanges', () => {
  const navigationInstrumentation = getNavigationInstrumentation({});
  let setCurrentRouteStub: sinon.SinonStub;
  let setInstrumentationTypeStub: sinon.SinonStub;

  before(() => {
    setCurrentRouteStub = sinon.stub(
      navigationInstrumentation,
      'setCurrentRoute'
    );
    setInstrumentationTypeStub = sinon.stub(
      navigationInstrumentation,
      'setInstrumentationType'
    );
  });

  afterEach(() => {
    setCurrentRouteStub.resetHistory();
  });

  it('should set the initial route', () => {
    const routesMatcher = () => [
      {
        pathname: '/test/123',
        route: { path: '/test/:123' },
      },
    ];
    const routesMatcherSpy = sinon.spy(routesMatcher);

    const mockRouter: Router = {
      routes: [{ path: '/' }, { path: '/test/:123' }],
      subscribe: (_callback: (state: RouterState) => void) => () => {},
    };

    listenToRouterChanges({
      routesMatcher: routesMatcherSpy,
      router: mockRouter,
      config: {
        pathnameDocument: { pathname: '/test/123' },
      },
    });

    void expect(routesMatcherSpy.calledOnce).to.be.true;
    void expect(routesMatcherSpy.firstCall.firstArg).to.deep.equal(
      mockRouter.routes
    );
    void expect(routesMatcherSpy.firstCall.lastArg).to.deep.equal({
      pathname: '/test/123',
    });
    void expect(setCurrentRouteStub.calledOnce).to.be.true;
    void expect(setCurrentRouteStub.firstCall.firstArg).to.deep.equal({
      url: '/test/123',
      path: '/test/:123',
    });

    void expect(setInstrumentationTypeStub.calledOnce).to.be.true;
    void expect(setInstrumentationTypeStub.firstCall.firstArg).to.equal(
      'react_router_data'
    );
  });

  it('should not set the initial state', () => {
    const routesMatcher = () => null;
    const routesMatcherSpy = sinon.spy(routesMatcher);

    const mockRouter: Router = {
      routes: [{ path: '/' }, { path: '/test/:123' }],
      subscribe: (_callback: (state: RouterState) => void) => () => {},
    };

    listenToRouterChanges({
      routesMatcher: routesMatcherSpy,
      router: mockRouter,
      config: {
        pathnameDocument: { pathname: '/test/123' },
      },
    });

    void expect(routesMatcherSpy.calledOnce).to.be.true;
    void expect(setCurrentRouteStub.notCalled).to.be.true;
  });

  it('should update the current route on state change', () => {
    let subscribeCallback: ((state: RouterState) => void) | null = () => {};
    const routesMatcher = () => null;
    const mockRouter: Router = {
      routes: [{ path: '/' }, { path: '/test/:123' }],
      subscribe: (callback: (state: RouterState) => void) => {
        subscribeCallback = callback;

        return () => {
          subscribeCallback = null;
        };
      },
    };

    listenToRouterChanges({
      routesMatcher,
      router: mockRouter,
      config: {
        pathnameDocument: { pathname: '/test/123' },
      },
    });

    void expect(setCurrentRouteStub.notCalled).to.be.true;

    subscribeCallback({
      location: { pathname: '/test/123/nested/more-nesting' },
      matches: [
        {
          pathname: '/test/123/nested',
          route: { path: '/test/:id/nested' },
        },
        {
          pathname: '/test/123/nested/more-nesting',
          route: { path: 'more-nesting' },
        },
      ],
    });

    void expect(setCurrentRouteStub.calledOnce).to.be.true;
    void expect(setCurrentRouteStub.firstCall.firstArg).to.deep.equal({
      url: '/test/123/nested/more-nesting',
      path: '/test/:id/nested/more-nesting',
    });
  });

  it('should unsubscribe from the router changes', () => {
    let subscribeCallback: ((state: RouterState) => void) | null = null;
    const routesMatcher = () => null;
    const mockRouter: Router = {
      routes: [{ path: '/' }, { path: '/test/:123' }],
      subscribe: (callback: (state: RouterState) => void) => {
        subscribeCallback = callback;

        return () => {
          subscribeCallback = null;
        };
      },
    };

    const unsubscribe = listenToRouterChanges({
      routesMatcher,
      router: mockRouter,
      config: {
        pathnameDocument: { pathname: '/test/123' },
      },
    });

    void expect(subscribeCallback).to.not.be.null;

    unsubscribe();

    void expect(subscribeCallback).to.be.null;
  });
});
