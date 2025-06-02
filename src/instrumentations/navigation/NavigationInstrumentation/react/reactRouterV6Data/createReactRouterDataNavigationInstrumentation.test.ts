import * as chai from 'chai';
import { createReactRouterDataNavigationInstrumentation } from './createReactRouterDataNavigationInstrumentation.js';
import { NavigationInstrumentation } from '../../index.js';

describe('createReactRouterV6DataNavigationInstrumentation', () => {
  it('should return a navigation instrumentation instance', () => {
    const instrumentation = createReactRouterDataNavigationInstrumentation({});

    chai.expect(instrumentation).to.be.instanceof(NavigationInstrumentation);
  });
});
