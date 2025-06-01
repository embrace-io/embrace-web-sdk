import * as chai from 'chai';
import { getNavigationInstrumentation } from './instance.js';

const { expect } = chai;

describe('getNavigationInstrumentation', () => {
  it('should create a new instance with custom configuration', () => {
    const instance = getNavigationInstrumentation({
      shouldCleanupPathOptionsFromRouteName: false,
    });

    // Spy NavigationInstrumentation constructor
    expect(instance)
      .to.have.property('_shouldCleanupPathOptionsFromRouteName')
      .to.equal(false);
  });

  it('should return a singleton instance of NavigationInstrumentation', () => {
    const instance1 = getNavigationInstrumentation();
    const instance2 = getNavigationInstrumentation();

    expect(instance1).to.equal(instance2);
  });
});
