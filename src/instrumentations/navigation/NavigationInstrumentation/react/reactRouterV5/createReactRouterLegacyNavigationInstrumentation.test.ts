import * as chai from 'chai';
import { createReactRouterLegacyNavigationInstrumentation } from './createReactRouterLegacyNavigationInstrumentation.js';
import { NavigationInstrumentation } from '../../index.js';

describe('createReactRouterLegacyNavigationInstrumentation', () => {
  it('should return a navigation instrumentation instance', () => {
    const instrumentation = createReactRouterLegacyNavigationInstrumentation(
      {}
    );

    chai.expect(instrumentation).to.be.instanceof(NavigationInstrumentation);
  });
});
