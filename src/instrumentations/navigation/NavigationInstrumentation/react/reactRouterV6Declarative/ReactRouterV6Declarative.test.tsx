import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
} from 'react-router-domv6plus';
import { page } from '../../../../../api-page';
import type { SpanSessionManager } from '../../../../../api-sessions';
import { session } from '../../../../../api-sessions';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbracePageManager,
  EmbraceSpanSessionManager,
} from '../../../../../managers';
import { PageSpanProcessor } from '../../../../../processors';
import { setupTestTraceExporter } from '../../../../../testUtils';
import { render } from '../../../../../testUtils/react/reactTestUtils';
import { runReactRouterTest } from '../testUtils/sharedTests';
import { About, Home, Product } from '../testUtils/testComponents';
import { withEmbraceRouting } from './withEmbraceRouting';

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
          element={<Product onNavigate={handleNavigation} />}
        />
      </EmbraceRoutes>
    );
  };

  return render(
    <MemoryRouter>
      <Switcher />
    </MemoryRouter>,
  );
};

describe('ReactRouterV5Legacy', () => {
  let pageManager: EmbracePageManager;
  let memoryExporter: InMemorySpanExporter;
  let spanSessionManager: SpanSessionManager;

  before(() => {
    spanSessionManager = new EmbraceSpanSessionManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
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
    spanSessionManager.startSessionSpan();

    expect(pageManager.getCurrentPageId()).to.be.null;
    expect(pageManager.getCurrentRoute()).to.be.null;

    const { tearDown, container } = renderReactApp();

    await runReactRouterTest({
      pageManager,
      rootElement: container,
    });

    spanSessionManager.endSessionSpan();
    tearDown();

    const routeSpans = memoryExporter
      .getFinishedSpans()
      .filter((span) => span.name !== 'emb-session');
    expect(routeSpans.length).to.equal(2);
    expect(routeSpans[0].name).to.equal('/');
    expect(routeSpans[1].name).to.equal('/product/:id');
  });
});
