import * as chai from 'chai';
import { createReactRouterV6DeclarativeNavigationInstrumentation } from './createReactRouterV6DeclarativeNavigationInstrumentation.js';
import { NavigationInstrumentation } from '../../index.js';

describe('createReactRouterV6DeclarativeNavigationInstrumentation', () => {
  it('should return a navigation instrumentation instance', () => {
    const instrumentation =
      createReactRouterV6DeclarativeNavigationInstrumentation({});

    chai.expect(instrumentation).to.be.instanceof(NavigationInstrumentation);
  });
});
