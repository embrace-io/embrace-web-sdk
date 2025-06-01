import * as chai from 'chai';
import { createReactRouterNavigationInstrumentation } from './createReactRouterNavigationInstrumentation.js';
import { NavigationInstrumentation } from '../../index.js';

describe('createReactRouterNavigationInstrumentation', () => {
  it('should return a navigation instrumentation instance', () => {
    const instrumentation = createReactRouterNavigationInstrumentation({});

    chai.expect(instrumentation).to.be.instanceof(NavigationInstrumentation);
  });
});
