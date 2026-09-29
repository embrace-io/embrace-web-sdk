import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-domv6plus';
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
import { withEmbraceRouting } from './withEmbraceRouting.ts';

const { expect } = chai;

const EmbraceRoutes = withEmbraceRouting(Routes);

const renderReactApp = () => {
  const Switcher = () => {
    const navigate = useNavigate();
    const handleNavigation = (path: string) => {
      navigate(path);
    };

    return (
      <EmbraceRoutes>
        <Route path="/" element={<Home onNavigate={handleNavigation} />} />
        <Route
          path="/about"
          element={<About onNavigate={handleNavigation} />}
        />
        <Route
          path="/product/:id"
          element={
            <>
              <Product onNavigate={handleNavigation} />
              <Outlet />
            </>
          }
        >
          <Route
            path="/product/:id/details"
            element={<ProductDetails onNavigate={handleNavigation} />}
          />
          <Route
            path="more-details"
            element={<div>Product Details Relative</div>}
          />
        </Route>
      </EmbraceRoutes>
    );
  };

  return render(
    <MemoryRouter>
      <Switcher />
    </MemoryRouter>,
  );
};

describe('ReactRouterV6Declarative', () => {
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

    // In production initSDK constructs this and registerInstrumentations
    // enables it once the tracer provider is wired. This test builds the
    // pipeline manually and has to follow the same order, or the route span
    // opened for the already-current route on enable would go to the wrong
    // tracer provider.
    new NavigationInstrumentation({ pageManager }).enable();
  });

  it('create route spans', async () => {
    userSessionManager.startSessionPartInternal({ reason: 'init' });

    expect(pageManager.getCurrentPageId()).to.match(UUID_PATTERN);
    expect(pageManager.getCurrentRoute()).to.deep.equal({
      path: window.location.pathname,
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
