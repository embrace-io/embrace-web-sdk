import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-domv6plus';
import {
  setupTestStorage,
  setupTestTraceExporter,
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
import type { SpanSessionManagerInternal } from '../../../../../managers/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbracePageManager,
  EmbraceSpanSessionManager,
} from '../../../../../managers/index.ts';
import { PageSpanProcessor } from '../../../../../processors/index.ts';
import { OTelPerformanceManager } from '../../../../../utils/index.ts';
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
  let spanSessionManager: SpanSessionManagerInternal;

  before(() => {
    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
      perf: new OTelPerformanceManager(),
      storage: setupTestStorage(),
      visibilityDoc: window.document,
    });

    session.setGlobalSessionManager(spanSessionManager);

    pageManager = new EmbracePageManager();
    page.setGlobalPageManager(pageManager);

    memoryExporter = setupTestTraceExporter([
      new PageSpanProcessor({
        pageManager,
      }),
    ]);
  });

  it('create route spans', async () => {
    spanSessionManager.startSessionPartInternal('init');

    expect(pageManager.getCurrentPageId()).to.be.null;
    expect(pageManager.getCurrentRoute()).to.be.null;

    const { tearDown, container } = renderReactApp();

    await runReactRouterTest({
      pageManager,
      rootElement: container,
    });

    spanSessionManager.endSessionPartInternal('user_session_ended', 'manual');
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
