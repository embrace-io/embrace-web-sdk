import { expect } from 'chai';
import { NoOpPageManager } from './NoOpPageManager.ts';

describe('NoOpPageManager', () => {
  let noOpPageManager: NoOpPageManager;

  beforeEach(() => {
    noOpPageManager = new NoOpPageManager();
  });

  it('should return null for getCurrentRoute', () => {
    const route = noOpPageManager.getCurrentRoute();
    void expect(route).to.be.null;
  });

  it('should do nothing for setCurrentRoute', () => {
    void expect(() => {
      noOpPageManager.setCurrentRoute({ path: '/test', url: '/test' });
    }).to.not.throw();
  });

  it('should return empty string for getCurrentPageId', () => {
    const pageId = noOpPageManager.getCurrentPageId();
    expect(pageId).to.equal('');
  });

  it('should do nothing for clearCurrentRoute', () => {
    void expect(() => {
      noOpPageManager.clearCurrentRoute();
    }).to.not.throw();
  });

  it('should return a no-op unsubscribe function for addRouteChangedListener', () => {
    const unsubscribe = noOpPageManager.addRouteChangedListener(() => {});
    void expect(() => {
      unsubscribe();
    }).to.not.throw();
  });
});
