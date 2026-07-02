import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { useEffect } from 'react';
import {
  createBrowserRouter,
  matchRoutes,
  Outlet,
  RouterProvider,
  useNavigate,
} from 'react-router-domv6plus';
import { TEST_DYNAMIC_CONFIG_MANAGER } from '../../../../../../tests/utils/constants.ts';
import { render } from '../../../../../../tests/utils/react/reactTestUtils.ts';
import { runReactRouterTest } from '../../../../../../tests/utils/react/sharedTests.ts';
import {
  About,
  Home,
  Product,
  ProductDetails,
} from '../../../../../../tests/utils/react/testComponents.tsx';
import { setupTestStorage } from '../../../../../../tests/utils/setupTestStorage.ts';
import { setupTestTraceExporter } from '../../../../../../tests/utils/setupTestTraceExporter.ts';
import { page } from '../../../../../api-page/pageAPI.ts';
import { session } from '../../../../../api-sessions/sessionAPI.ts';
import { DEFAULT_LIMITS } from '../../../../../managers/EmbraceLimitManager/constants.ts';
import { EmbraceLimitManager } from '../../../../../managers/EmbraceLimitManager/EmbraceLimitManager.ts';
import { EmbracePageManager } from '../../../../../managers/EmbracePageManager/EmbracePageManager.ts';
import { EmbraceUserSessionManager } from '../../../../../managers/EmbraceUserSessionManager/EmbraceUserSessionManager.ts';
import type { UserSessionManagerInternal } from '../../../../../managers/EmbraceUserSessionManager/types.ts';
import { PageSpanProcessor } from '../../../../../processors/PageSpanProcessor/index.ts';
import { OTelPerformanceManager } from '../../../../../utils/PerformanceManager/OTelPerformanceManager.ts';
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
  });

  it('create route spans', async () => {
    userSessionManager.startSessionPartInternal({ reason: 'init' });

    expect(pageManager.getCurrentPageId()).to.be.null;
    expect(pageManager.getCurrentRoute()).to.be.null;

    const { tearDown, container } = renderReactApp();

    await runReactRouterTest({
      pageManager,
      rootElement: container,
    });

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
