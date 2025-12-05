import { expect } from 'chai';
import { PageAPI } from './api/index.ts';
import { page } from './pageAPI.ts';

describe('pageAPI', () => {
  it('should export an instance of PageAPI', () => {
    expect(page).to.be.instanceOf(PageAPI);
  });

  it('should return the same instance on multiple calls', () => {
    const pageInstance1 = page;
    const pageInstance2 = PageAPI.getInstance();
    expect(pageInstance1).to.equal(pageInstance2);
  });
});
