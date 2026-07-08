import * as chai from 'chai';
import * as sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { UUID_PATTERN } from '../../../tests/utils/constants.ts';
import type { Route } from '../../api-page/index.ts';
import type { NavigationHost, TitleDocument } from '../../common/index.ts';
import type { UserSessionManagerInternal } from '../EmbraceUserSessionManager/index.ts';
import { EmbracePageManager } from './EmbracePageManager.ts';

chai.use(sinonChai);
const { expect } = chai;

class FakeNavigation {
  private readonly _listeners: Array<
    (event: NavigationCurrentEntryChangeEvent) => void
  > = [];

  public addEventListener(
    _type: 'currententrychange',
    listener: (event: NavigationCurrentEntryChangeEvent) => void,
  ): void {
    this._listeners.push(listener);
  }

  public removeEventListener(
    _type: 'currententrychange',
    listener: (event: NavigationCurrentEntryChangeEvent) => void,
  ): void {
    const i = this._listeners.indexOf(listener);
    if (i !== -1) {
      this._listeners.splice(i, 1);
    }
  }

  public fire(from: string): void {
    const event = Object.assign(new Event('currententrychange'), {
      from: { url: from },
    }) as NavigationCurrentEntryChangeEvent;
    for (const listener of [...this._listeners]) {
      listener(event);
    }
  }
}

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

  it('should notify route changed listeners on every setCurrentRoute call', () => {
    const listener = sinon.spy();
    pageManager.addRouteChangedListener(listener);

    const route: Route = { path: '/products/:id', url: '/products/123' };
    pageManager.setCurrentRoute(route);

    void expect(listener.calledOnceWith(route)).to.be.true;

    pageManager.setCurrentRoute(route);
    void expect(listener.calledTwice).to.be.true;
  });

  it('should stop notifying a route changed listener after unsubscribing', () => {
    const listener = sinon.spy();
    const unsubscribe = pageManager.addRouteChangedListener(listener);

    unsubscribe();
    pageManager.setCurrentRoute({
      path: '/products/:id',
      url: '/products/123',
    });

    void expect(listener.notCalled).to.be.true;
  });

  it('should isolate a throwing route changed listener from other listeners', () => {
    const throwingListener = sinon.stub().throws(new Error('boom'));
    const otherListener = sinon.spy();
    pageManager.addRouteChangedListener(throwingListener);
    pageManager.addRouteChangedListener(otherListener);

    expect(() =>
      pageManager.setCurrentRoute({
        path: '/products/:id',
        url: '/products/123',
      }),
    ).to.not.throw();

    void expect(otherListener.calledOnce).to.be.true;
  });

  describe('soft navigation (currententrychange)', () => {
    let navigation: FakeNavigation;
    let userSessionManager: UserSessionManagerInternal;
    let rolloverStub: sinon.SinonStub;
    let navigationHost: NavigationHost;

    const createPageManager = (
      overrides: { userSessionManager?: UserSessionManagerInternal } = {},
    ) =>
      new EmbracePageManager({
        navigationHost,
        userSessionManager: overrides.userSessionManager ?? userSessionManager,
      });

    beforeEach(() => {
      navigation = new FakeNavigation();
      rolloverStub = sinon.stub();
      userSessionManager = {
        rolloverSessionPartInternal: rolloverStub,
      } as unknown as UserSessionManagerInternal;
      navigationHost = {
        navigation: navigation as unknown as Navigation,
        location: {
          href: 'http://current.example.com/products/123',
          pathname: '/products/123',
        },
      };
    });

    it('sets a placeholder route from the raw pathname on soft navigation', () => {
      const manager = createPageManager();

      navigation.fire('http://previous.example.com/');

      expect(manager.getCurrentRoute()).to.deep.equal({
        path: '/products/123',
        url: '/products/123',
      });
    });

    it('rolls over the session part with web_soft_navigation reasons', () => {
      createPageManager();

      navigation.fire('http://previous.example.com/');

      void expect(rolloverStub.calledOnce).to.be.true;
      expect(rolloverStub.firstCall.args[0]).to.deep.equal({
        endReason: 'web_soft_navigation',
        startReason: 'web_soft_navigation',
      });
    });

    it('rolls over the session part before setting the placeholder route', () => {
      const calls: string[] = [];
      const manager = createPageManager();
      manager.addRouteChangedListener(() => calls.push('routeChanged'));
      rolloverStub.callsFake(() => calls.push('rollover'));

      navigation.fire('http://previous.example.com/');

      // NavigationInstrumentation ends its route span from the
      // session-part-ended listener, which fires before the outgoing
      // session-part span itself ends. Rolling over first ends the outgoing
      // route span while it's still the correct one — setting the new route
      // first would end it too late for that listener to still be pointing
      // at it.
      expect(calls).to.deep.equal(['rollover', 'routeChanged']);
    });

    it('is a no-op when navigating to the same URL', () => {
      const manager = createPageManager();

      navigation.fire('http://current.example.com/products/123');

      void expect(manager.getCurrentRoute()).to.be.null;
      void expect(rolloverStub.notCalled).to.be.true;
    });

    it('still updates the route when no userSessionManager is provided', () => {
      const manager = new EmbracePageManager({ navigationHost });

      expect(() => {
        navigation.fire('http://previous.example.com/');
      }).to.not.throw();

      expect(manager.getCurrentRoute()).to.deep.equal({
        path: '/products/123',
        url: '/products/123',
      });
    });

    it('does not throw when constructed without a Navigation API (old browser)', () => {
      expect(() => {
        new EmbracePageManager({
          navigationHost: { location: navigationHost.location },
          userSessionManager,
        });
      }).to.not.throw();
    });
  });
});
