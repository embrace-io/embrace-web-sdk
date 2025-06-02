import * as chai from 'chai';
import { createReactRouterDeclarativeNavigationInstrumentation } from './createReactRouterDeclarativeNavigationInstrumentation.js';
import { NavigationInstrumentation } from '../../index.js';

describe('createReactRouterDeclarativeNavigationInstrumentation', () => {
  it('should return a navigation instrumentation instance', () => {
    const instrumentation =
      createReactRouterDeclarativeNavigationInstrumentation({});

    chai.expect(instrumentation).to.be.instanceof(NavigationInstrumentation);
  });
});
