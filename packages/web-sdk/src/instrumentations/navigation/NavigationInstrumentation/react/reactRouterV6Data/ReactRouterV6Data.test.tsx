import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import { useEffect } from 'react';
import {
  createBrowserRouter,
  matchRoutes,
  Outlet,
  RouterProvider,
  useNavigate,
} from 'react-router-domv6plus';
import * as sinon from 'sinon';
import { UUID_PATTERN } from '../../../../../../tests/utils/constants.ts';
import {
  setupTestStorage,
  setupTestTraceExporter,
  TEST_DYNAMIC_CONFIG_MANAGER,
} from '../../../../../../tests/utils/index.ts';
import { render } from '../../../../../../tests/utils/react/reactTestUtils.ts';
import { runReactRouterTest } from '../../../../../../tests/utils/react/sharedTests.ts';
import {
  About,
  Home,
  Product,
  ProductDetails,
} from '../../../../../../tests/utils/react/testComponents.tsx';
import { page } from '../../../../../api-page/index.ts';
import { session } from '../../../../../api-sessions/index.ts';
import type { UserSessionManagerInternal } from '../../../../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbracePageManager,
  EmbraceUserSessionManager,
} from '../../../../../managers/index.ts';
import { PageSpanProcessor } from '../../../../../processors/index.ts';
import { OTelPerformanceManager } from '../../../../../utils/index.ts';
import { NavigationInstrumentation } from '../../index.ts';
import { listenToRouterChanges } from './listenToRouterChanges.ts';

const { expect } = chai;

const HomeWithNavigation = () => {
  const navigate = useNavigate();

  return <Home onNavigate={navigate} />;
};

const ProductWithNavigation = () => {
  const navigate = useNavigate();

  return (
    <>
      <Product onNavigate={navigate} />
      <Outlet />
    </>
  );
};

const AboutWithNavigation = () => {
  const navigate = useNavigate();

  return <About onNavigate={navigate} />;
};

const DetailsWithNavigation = () => {
  const navigate = useNavigate();

  return <ProductDetails onNavigate={navigate} />;
};

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomeWithNavigation />,
  },
  {
    path: '/product/:id',
    element: <ProductWithNavigation />,
    children: [
      {
        path: '/product/:id/details',
        element: <DetailsWithNavigation />,
      },
      {
        path: 'more-details',
        element: <div>Product Details Relative</div>,
      },
    ],
  },
  {
    path: '/about',
    element: <AboutWithNavigation />,
  },
]);

const renderReactApp = () => {
  const Switcher = () => {
    useEffect(() => {
      return listenToRouterChanges({
        router,
        routesMatcher: matchRoutes,
      });
    }, []);

    return <RouterProvider router={router} />;
  };

  return render(<Switcher />);
};

describe('ReactRouterV6Data', () => {
  let pageManager: EmbracePageManager;
  let memoryExporter: InMemorySpanExporter;
  let userSessionManager: UserSessionManagerInternal;

  before(() => {
    userSessionManager = new EmbraceUserSessionManager({
      dynamicConfigManager: TEST_DYNAMIC_CONFIG_MANAGER,
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf: new OTelPerformanceManager(),
      storage: setupTestStorage(),
      visibilityDoc: window.document,
    });

    session.setGlobalUserSessionManager(userSessionManager);

    pageManager = new EmbracePageManager();
    page.setGlobalPageManager(pageManager);

    memoryExporter = setupTestTraceExporter([
      new PageSpanProcessor({
        pageManager,
      }),
    ]);

    // Enabled after the tracer provider is registered, as in initSDK: enabling
    // first would open the already-current route's span on the API's no-op tracer.
    new NavigationInstrumentation({ pageManager }).enable();
  });

  it('create route spans', async () => {
    userSessionManager.startSessionPartInternal({ reason: 'init' });

    expect(pageManager.getCurrentPageId()).to.match(UUID_PATTERN);
    expect(pageManager.getCurrentRoute()).to.deep.equal({
      url: window.location.pathname,
    });

    const { tearDown, container } = renderReactApp();

    await runReactRouterTest({
      pageManager,
      rootElement: container,
    });

    // Ends the last navigated route's still-open span too, since a route
    // span must not outlive the session part it started in.
    userSessionManager.endSessionPartInternal({
      reason: 'user_session_ended',
      userSessionEndReason: 'manual',
    });
    tearDown();

    const routeSpans = memoryExporter
      .getFinishedSpans()
      .filter((span) => span.name !== 'emb-session-part');
    expect(routeSpans.length).to.equal(4);
    expect(routeSpans[0].name).to.equal('/');
    expect(routeSpans[1].name).to.equal('/product/:id');
    expect(routeSpans[2].name).to.equal('/product/:id/details');
    expect(routeSpans[3].name).to.equal('/product/:id/more-details');
  });
});

describe('ReactRouterV6Data - pathless layout routes', () => {
  let pageManager: EmbracePageManager;
  let setCurrentRouteSpy: sinon.SinonSpy;

  beforeEach(() => {
    // A prior test file's navigation can leave real browser history on a
    // different path; this block exercises the initial, pre-navigation match.
    window.history.replaceState(null, '', '/');
    pageManager = new EmbracePageManager();
    page.setGlobalPageManager(pageManager);
    setCurrentRouteSpy = sinon.spy(page, 'setCurrentRoute');
  });

  afterEach(() => {
    setCurrentRouteSpy.restore();
  });

  it('reports the matched route pattern for a route wrapped in a pathless layout route', () => {
    // A pathless layout route (no `path`, e.g. a shared shell/providers
    // wrapper) shares its pathname with the '/' route it wraps. In the
    // matches array it appears first and lacks `route.path`.
    const pathlessLayoutRouter = createBrowserRouter([
      {
        element: <Outlet />,
        children: [
          { path: '/', element: <div>Home</div> },
          { path: '/about', element: <div>About</div> },
        ],
      },
    ]);

    const Switcher = () => {
      useEffect(() => {
        return listenToRouterChanges({
          router: pathlessLayoutRouter,
          routesMatcher: matchRoutes,
        });
      }, []);

      return <RouterProvider router={pathlessLayoutRouter} />;
    };

    const { tearDown } = render(<Switcher />);

    // getRouteFromMatches finds the pathless layout's own match before the
    // '/' route's match (both share pathname '/'), sees it has no
    // `route.path`, and bails to null — so listenToRouterChanges never
    // calls page.setCurrentRoute for an otherwise perfectly matched route.
    expect(setCurrentRouteSpy.calledWith({ path: '/', url: '/' })).to.be.true;

    tearDown();
  });
});
