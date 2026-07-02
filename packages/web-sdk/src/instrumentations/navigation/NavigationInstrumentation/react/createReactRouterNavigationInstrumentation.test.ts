import * as chai from 'chai';
import { NavigationInstrumentation } from '../NavigationInstrumentation.ts';
import { createReactRouterNavigationInstrumentation } from './createReactRouterNavigationInstrumentation.ts';

describe('createReactRouterNavigationInstrumentation', () => {
  it('should return a navigation instrumentation instance', () => {
    const instrumentation = createReactRouterNavigationInstrumentation({});

    chai.expect(instrumentation).to.be.instanceof(NavigationInstrumentation);
  });
});
