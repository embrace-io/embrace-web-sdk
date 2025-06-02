import * as chai from 'chai';
import { createReactRouterV6DataNavigationInstrumentation } from './createReactRouterV6DataNavigationInstrumentation.js';
import { NavigationInstrumentation } from '../../index.js';

describe('createReactRouterV6DataNavigationInstrumentation', () => {
  it('should return a navigation instrumentation instance', () => {
    const instrumentation = createReactRouterV6DataNavigationInstrumentation(
      {}
    );

    chai.expect(instrumentation).to.be.instanceof(NavigationInstrumentation);
  });
});
