import * as chai from 'chai';
import { NavigationInstrumentation } from '../../index.js';
import { createReactRouterNavigationInstrumentation } from './createReactRouterNavigationInstrumentation.js';

describe('createReactRouterNavigationInstrumentation', () => {
  it('should return a navigation instrumentation instance', () => {
    const instrumentation = createReactRouterNavigationInstrumentation({});

    chai.expect(instrumentation).to.be.instanceof(NavigationInstrumentation);
  });
});
