import * as chai from 'chai';
import {
  createReactRouterNavigationInstrumentation,
  EmbraceErrorBoundary,
  listenToRouterChanges,
  withEmbraceRouting,
  withEmbraceRoutingLegacy,
} from './index.ts';

const { expect } = chai;

describe('react-instrumentation no-op navigation helpers', () => {
  it('withEmbraceRouting returns the component unchanged', () => {
    const Component = () => null;
    expect(withEmbraceRouting(Component)).to.equal(Component);
  });

  it('withEmbraceRoutingLegacy returns the component unchanged', () => {
    const Component = () => null;
    expect(withEmbraceRoutingLegacy(Component)).to.equal(Component);
  });

  it('listenToRouterChanges returns a no-op unsubscribe', () => {
    const unsubscribe = listenToRouterChanges({});
    expect(unsubscribe).to.be.a('function');
    expect(() => unsubscribe()).to.not.throw();
  });

  it('createReactRouterNavigationInstrumentation returns a usable instrumentation', () => {
    const instrumentation = createReactRouterNavigationInstrumentation();
    expect(instrumentation).to.have.property('enable');
    expect(instrumentation).to.have.property('disable');
    expect(() => {
      instrumentation.enable();
      instrumentation.disable();
    }).to.not.throw();
  });

  it('still exports EmbraceErrorBoundary', () => {
    expect(EmbraceErrorBoundary).to.be.a('function');
  });
});
