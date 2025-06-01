import * as chai from 'chai';
import { createReactRouterV5NavigationInstrumentation } from './createReactRouterV5NavigationInstrumentation.js';
import { NavigationInstrumentation } from '../../index.js';

describe('createReactRouterV5NavigationInstrumentation', () => {
  it('should return a navigation instrumentation instance', () => {
    const instrumentation = createReactRouterV5NavigationInstrumentation({});

    chai.expect(instrumentation).to.be.instanceof(NavigationInstrumentation);
  });
});
