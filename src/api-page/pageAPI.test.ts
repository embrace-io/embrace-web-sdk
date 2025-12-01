import { expect } from 'chai';
import { PageAPI } from './api/index.js';
import { page } from './pageAPI.js';

describe('pageAPI', () => {
  it('should export a page instance with expected methods', () => {
    expect(page).to.have.property('setCurrentRoute');
    expect(page).to.have.property('getCurrentRoute');
    expect(page).to.have.property('setGlobalPageManager');
  });

  it('should return the same instance on multiple calls', () => {
    const pageInstance1 = page;
    const pageInstance2 = PageAPI.getInstance();
    expect(pageInstance1).to.equal(pageInstance2);
  });
});
