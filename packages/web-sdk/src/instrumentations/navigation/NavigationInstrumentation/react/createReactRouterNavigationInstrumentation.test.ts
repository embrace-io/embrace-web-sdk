import * as chai from 'chai';
import { createReactRouterNavigationInstrumentation } from './createReactRouterNavigationInstrumentation.ts';

const { expect } = chai;

describe('createReactRouterNavigationInstrumentation', () => {
  it('should return an inert instrumentation whose methods do nothing', () => {
    const instrumentation = createReactRouterNavigationInstrumentation({});

    expect(() => {
      instrumentation.enable();
      instrumentation.disable();
      instrumentation.setConfig({});
      instrumentation.getConfig();
    }).to.not.throw();
  });

  it('should not throw when called with no arguments', () => {
    expect(() => {
      createReactRouterNavigationInstrumentation();
    }).to.not.throw();
  });
});
