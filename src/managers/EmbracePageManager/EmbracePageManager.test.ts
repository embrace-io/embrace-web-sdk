import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import type { Route } from '../../api-page/index.ts';
import { UUID_PATTERN } from '../../testUtils/constants.ts';
import { EmbracePageManager } from './EmbracePageManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbracePageManager', () => {
  let pageManager: EmbracePageManager;

  beforeEach(() => {
    pageManager = new EmbracePageManager();
  });

  it('should initialize with null values', () => {
    const route = pageManager.getCurrentRoute();
    const pageId = pageManager.getCurrentPageId();

    void expect(pageId).to.be.null;
    void expect(route).to.be.null;
  });

  it('should set and get current route', () => {
    const mockRoute: Route = {
      path: '/products/:id',
      url: '/products/123',
    };

    pageManager.setCurrentRoute(mockRoute);

    const route = pageManager.getCurrentRoute();
    const pageId = pageManager.getCurrentPageId();

    expect(route).to.equal(mockRoute);
    expect(pageId).to.match(UUID_PATTERN);
  });

  it('should generate new page ID when route URL changes', () => {
    const initialRoute: Route = {
      path: '/products/:id',
      url: '/products/123',
    };

    const newRoute: Route = {
      path: '/products/:id',
      url: '/products/456',
    };

    pageManager.setCurrentRoute(initialRoute);
    const initialPageId = pageManager.getCurrentPageId();
    expect(initialPageId).to.match(UUID_PATTERN);

    pageManager.setCurrentRoute(newRoute);
    const newPageId = pageManager.getCurrentPageId();
    expect(newPageId).to.match(UUID_PATTERN);
    expect(newPageId).to.not.equal(initialPageId);
  });

  it('should not generate new page ID when setting same route URL', () => {
    const route: Route = {
      path: '/products/:id',
      url: '/products/123',
    };

    pageManager.setCurrentRoute(route);
    const initialPageId = pageManager.getCurrentPageId();

    pageManager.setCurrentRoute(route);
    const secondPageId = pageManager.getCurrentPageId();

    expect(initialPageId).to.equal(secondPageId);
  });
});
