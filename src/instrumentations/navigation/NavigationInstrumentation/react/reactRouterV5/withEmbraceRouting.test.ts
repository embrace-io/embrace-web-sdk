import * as chai from 'chai';
import * as sinon from 'sinon';
import { withEmbraceRouting } from './withEmbraceRouting.js';
import { getNavigationInstrumentation } from '../../index.js';
import type { RouteComponentProps } from './types.js';
import sinonChai from 'sinon-chai';

chai.use(sinonChai);
const { expect } = chai;

describe('withEmbraceRouting', () => {
  const navigationInstrumentation = getNavigationInstrumentation({});
  const MockRouteComponent = () => null;
  let setCurrentRouteStub: sinon.SinonStub;

  before(() => {
    setCurrentRouteStub = sinon.stub(
      navigationInstrumentation,
      'setCurrentRoute'
    );
  });

  afterEach(() => {
    setCurrentRouteStub.resetHistory();
  });

  it('should set the current route', () => {
    const OTelRoute = withEmbraceRouting(MockRouteComponent);
    const props = {
      path: '/test/:id',
      computedMatch: {
        path: '/test/:id',
        url: '/test/123',
      },
    };

    // Manually casting to RouteComponentProps to match what react-router does
    void OTelRoute(props as RouteComponentProps);

    void expect(setCurrentRouteStub.calledOnce).to.be.true;
    void expect(setCurrentRouteStub).to.have.been.calledOnceWith(
      props.computedMatch
    );
  });

  it('should not set the current route if the path is undefined', () => {
    const OTelRoute = withEmbraceRouting(MockRouteComponent);

    void OTelRoute({});

    void expect(setCurrentRouteStub.notCalled).to.be.true;
  });

  it('should not set the current route if computedMatch is undefined', () => {
    const OTelRoute = withEmbraceRouting(MockRouteComponent);
    const props = { path: '/test/:id' };

    void OTelRoute(props as RouteComponentProps);

    void expect(setCurrentRouteStub.notCalled).to.be.true;
  });

  it('should preserve the display name of the wrapped component', () => {
    const OTelRoute = withEmbraceRouting(MockRouteComponent);
    void expect(OTelRoute.displayName).to.equal(
      `withEmbraceRouting(MockRouteComponent)`
    );
  });
});
