import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { getNavigationInstrumentation } from '../../index.js';
import { withEmbraceRouting } from './withEmbraceRouting.js';
import type { RoutesFunctionalComponentReturn } from './types.js';
import type React from 'react';
import type { Route } from '../../index.js';

chai.use(sinonChai);

const { expect } = chai;

describe('withEmbraceRouting', () => {
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

  it('should set the current route for a non nested route', () => {
    const MockRouteComponent = (): RoutesFunctionalComponentReturn => ({
      props: {
        match: {
          pathname: '/test/123',
          pathnameBase: '/test/123',
          route: {
            path: '/test/:id',
          },
        },
      },
    });

    const OTelRoute = withEmbraceRouting(
      MockRouteComponent as unknown as React.FunctionComponent
    );

    void OTelRoute({});

    void expect(setCurrentRouteStub.calledOnce).to.be.true;

    const callArgs = setCurrentRouteStub.firstCall.args[0] as Route;
    void expect(callArgs.path).to.equal('/test/:id');
    void expect(callArgs.url).to.equal('/test/123');

    void expect(setInstrumentationTypeStub.calledOnce).to.be.true;
    void expect(setInstrumentationTypeStub.firstCall.args[0]).to.equal(
      'react_router_declarative'
    );
  });

  it('should set the current route for a nested route', () => {
    const MockRouteComponent = (): RoutesFunctionalComponentReturn => ({
      props: {
        match: {
          pathname: '/test/123',
          pathnameBase: '/test/123',
          route: {
            path: '/test/:id',
          },
        },
        routeContext: {
          outlet: {
            props: {
              match: {
                pathname: '/test/123/nested',
                pathnameBase: '/test/123/nested',
                route: {
                  path: 'nested',
                },
              },
              routeContext: {
                outlet: {
                  props: {
                    match: {
                      pathname: '/test/123/nested/more-nesting',
                      pathnameBase: '/test/123/nested/more-nesting',
                      route: {
                        path: 'more-nesting',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const OTelRoute = withEmbraceRouting(
      MockRouteComponent as unknown as React.FunctionComponent
    );

    void OTelRoute({});

    void expect(setCurrentRouteStub.calledOnce).to.be.true;

    const callArgs = setCurrentRouteStub.firstCall.args[0] as Route;
    void expect(callArgs.path).to.equal('/test/:id/nested/more-nesting');
    void expect(callArgs.url).to.equal('/test/123/nested/more-nesting');
  });

  it('should not set the current route if the match is undefined', () => {
    const MockRouteComponent = (): RoutesFunctionalComponentReturn => ({
      props: {},
    });

    const OTelRoute = withEmbraceRouting(
      MockRouteComponent as unknown as React.FunctionComponent
    );

    void OTelRoute({});

    void expect(setCurrentRouteStub.notCalled).to.be.true;
  });

  it('should not set the current route if the route is undefined', () => {
    const MockRouteComponent = (): RoutesFunctionalComponentReturn => ({
      props: {
        match: {
          pathname: '/test/123',
          pathnameBase: '/test/123',
        },
      },
    });

    const OTelRoute = withEmbraceRouting(
      MockRouteComponent as unknown as React.FunctionComponent
    );

    void OTelRoute({});

    void expect(setCurrentRouteStub.notCalled).to.be.true;
  });

  it('should preserve the display name of the wrapped component', () => {
    const MockRouteComponent = (): RoutesFunctionalComponentReturn => ({
      props: {},
    });

    const OTelRoute = withEmbraceRouting(
      MockRouteComponent as unknown as React.FunctionComponent
    );

    void expect(OTelRoute.displayName).to.equal(
      `withEmbraceRouting(MockRouteComponent)`
    );
  });
});
