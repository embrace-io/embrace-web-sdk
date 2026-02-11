import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { useEffect } from 'react';
import {
  createBrowserRouter,
  matchRoutes,
  RouterProvider,
  useNavigate,
} from 'react-router-domv6plus';
import { setupTestTraceExporter } from '../../../../../../tests/utils/index.ts';
import { render } from '../../../../../../tests/utils/react/reactTestUtils.ts';
import { runReactRouterTest } from '../../../../../../tests/utils/react/sharedTests.ts';
import {
  About,
  Home,
  Product,
} from '../../../../../../tests/utils/react/testComponents.tsx';
import { page } from '../../../../../api-page/index.ts';
import type { SpanSessionManager } from '../../../../../api-sessions/index.ts';
import { session } from '../../../../../api-sessions/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbracePageManager,
  EmbraceSpanSessionManager,
} from '../../../../../managers/index.ts';
import { PageSpanProcessor } from '../../../../../processors/index.ts';
import { listenToRouterChanges } from './listenToRouterChanges.ts';

const { expect } = chai;

const HomeWithNavigation = () => {
  const navigate = useNavigate();

  return <Home onNavigate={navigate} />;
};

const ProductWithNavigation = () => {
  const navigate = useNavigate();

  return <Product onNavigate={navigate} />;
};

const AboutWithNavigation = () => {
  const navigate = useNavigate();

  return <About onNavigate={navigate} />;
};

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomeWithNavigation />,
  },
  {
    path: '/product/:id',
    element: <ProductWithNavigation />,
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
