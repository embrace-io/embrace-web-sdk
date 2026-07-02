import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { UUID_PATTERN } from '../../../tests/utils/constants.ts';
import type { Route } from '../../api-page/manager/types.ts';
import type { TitleDocument } from '../../common/types.ts';
import { EmbracePageManager } from './EmbracePageManager.ts';

chai.use(sinonChai);
const { expect } = chai;

describe('EmbracePageManager', () => {
  let pageManager: EmbracePageManager;
  let mockDocument: TitleDocument;

  beforeEach(() => {
    mockDocument = { title: '' };
    pageManager = new EmbracePageManager({ titleDocument: mockDocument });
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

  it('should set and get custom route label', () => {
    pageManager.setPageLabel('my-custom-label');
    expect(pageManager.getPageLabel()).to.equal('my-custom-label');
  });

  it('should fallback to document.title when custom label is not set', () => {
    mockDocument.title = 'My Page Title';
    expect(pageManager.getPageLabel()).to.equal('My Page Title');
  });

  it('should not fallback to document.title when fallback is disabled', () => {
    const customPageManager = new EmbracePageManager({
      useDocumentTitleAsPageLabel: false,
      titleDocument: mockDocument,
    });
    mockDocument.title = 'My Page Title';
    void expect(customPageManager.getPageLabel()).to.be.null;
  });

  it('should prefer custom label over document.title fallback', () => {
    mockDocument.title = 'My Page Title';
    pageManager.setPageLabel('custom-label');
    expect(pageManager.getPageLabel()).to.equal('custom-label');
  });

  it('should set route label from route.label when setting route', () => {
    const routeWithLabel: Route = {
      path: '/products/:id',
      url: '/products/123',
      label: 'Products Page',
    };
    pageManager.setCurrentRoute(routeWithLabel);
    expect(pageManager.getPageLabel()).to.equal('Products Page');
  });

  it('should clear custom label on routing', () => {
    mockDocument.title = 'My Page Title';
    pageManager.setPageLabel('custom-label');
    pageManager.clearCurrentRoute();
    expect(pageManager.getPageLabel()).to.equal('My Page Title');
  });
});
