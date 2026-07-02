import { expect } from 'chai';
import { EmbracePageManager } from '../managers/EmbracePageManager/EmbracePageManager.ts';
import { PageAPI } from './api/PageAPI/PageAPI.ts';
import { page } from './pageAPI.ts';

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

  describe('incorrect usage', () => {
    let manager: EmbracePageManager;

    type IncorrectUsageTest = {
      name: string;
      invocation: () => unknown;
    };

    const tests: IncorrectUsageTest[] = [
      {
        name: 'setCurrentRoute',
        // @ts-expect-error
        invocation: () => page.setCurrentRoute(undefined),
      },
    ];

    beforeEach(() => {
      manager = new EmbracePageManager();
      page.setGlobalPageManager(manager);
    });

    tests.forEach((test) => {
      it(`${test.name} should handle incorrect usage`, async () => {
        expect(() => {
          test.invocation();
        }).to.not.throw();
      });
    });
  });
});
