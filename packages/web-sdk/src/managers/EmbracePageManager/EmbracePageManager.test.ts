import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { UUID_PATTERN } from '../../../tests/utils/constants.ts';
import type { Route } from '../../api-page/index.ts';
import type { NavigationHost, TitleDocument } from '../../common/index.ts';
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

interface FakeNavigationHost extends NavigationHost {
  setHref: (href: string) => void;
  fire: () => void;
}

const makeNavigationHost = (href: string): FakeNavigationHost => {
  let listener: EventListener | null = null;

  return {
    location: { href },
    navigation: {
      addEventListener: (_type: string, callback: EventListener) => {
        listener = callback;
      },
      removeEventListener: () => {
        listener = null;
      },
    } as unknown as Navigation,
    setHref(next: string) {
      this.location.href = next;
    },
    fire() {
      listener?.(new Event('currententrychange'));
    },
  };
};

describe('EmbracePageManager route templates', () => {
  it('seeds the current route from the URL when routes are configured', () => {
    const pageManager = new EmbracePageManager({
      routes: ['/order/:id'],
      navigationHost: makeNavigationHost('https://app.test/order/123'),
    });

    expect(pageManager.getCurrentRoute()).to.deep.equal({
      path: '/order/:id',
      url: '/order/123',
    });
  });

  it('updates the current route on navigation', () => {
    const host = makeNavigationHost('https://app.test/');
    const pageManager = new EmbracePageManager({
      routes: ['/', '/order/:id'],
      navigationHost: host,
    });

    host.setHref('https://app.test/order/9');
    host.fire();

    expect(pageManager.getCurrentRoute()).to.deep.equal({
      path: '/order/:id',
      url: '/order/9',
    });
  });

  it('mints a new page id when the pathname changes on navigation', () => {
    const host = makeNavigationHost('https://app.test/order/9');
    const pageManager = new EmbracePageManager({
      routes: ['/order/:id'],
      navigationHost: host,
    });

    const seedPageId = pageManager.getCurrentPageId();
    expect(seedPageId).to.match(UUID_PATTERN);

    host.setHref('https://app.test/order/10');
    host.fire();

    const nextPageId = pageManager.getCurrentPageId();
    expect(nextPageId).to.match(UUID_PATTERN);
    expect(nextPageId).to.not.equal(seedPageId);
  });

  it('keeps the same page id when only the query string changes', () => {
    const host = makeNavigationHost('https://app.test/order/9');
    const pageManager = new EmbracePageManager({
      routes: ['/order/:id'],
      navigationHost: host,
    });

    const seedPageId = pageManager.getCurrentPageId();

    host.setHref('https://app.test/order/9?tab=details');
    host.fire();

    expect(pageManager.getCurrentPageId()).to.equal(seedPageId);
    expect(pageManager.getCurrentRoute()).to.deep.equal({
      path: '/order/:id',
      url: '/order/9',
    });
  });

  it('falls back to the raw pathname when no template matches', () => {
    const pageManager = new EmbracePageManager({
      routes: ['/order/:id'],
      navigationHost: makeNavigationHost('https://app.test/unknown'),
    });

    expect(pageManager.getCurrentRoute()).to.deep.equal({
      path: '/unknown',
      url: '/unknown',
    });
  });

  it('does not track navigation when no routes are configured', () => {
    const host = makeNavigationHost('https://app.test/order/1');
    const pageManager = new EmbracePageManager({ navigationHost: host });

    host.setHref('https://app.test/order/2');
    host.fire();

    void expect(pageManager.getCurrentRoute()).to.be.null;
  });

  it('does not throw when the Navigation API is unavailable', () => {
    const pageManager = new EmbracePageManager({
      routes: ['/order/:id'],
      navigationHost: { location: { href: 'https://app.test/order/1' } },
    });

    expect(pageManager.getCurrentRoute()).to.deep.equal({
      path: '/order/:id',
      url: '/order/1',
    });
  });
});
