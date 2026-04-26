import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { createBrowserHistory } from 'history';
import { Route, Router, Switch, useHistory } from 'react-router-domv4v5';
import { setupTestTraceExporter } from '../../../../../../tests/utils/index.ts';
import { render } from '../../../../../../tests/utils/react/reactTestUtils.ts';
import { runReactRouterTest } from '../../../../../../tests/utils/react/sharedTests.ts';
import {
  About,
  Home,
  Product,
  ProductDetails,
} from '../../../../../../tests/utils/react/testComponents.tsx';
import { page } from '../../../../../api-page/index.ts';
import type { SessionPartManager } from '../../../../../api-sessions/index.ts';
import { session } from '../../../../../api-sessions/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceLimitManager,
  EmbracePageManager,
  EmbraceSessionPartManager,
} from '../../../../../managers/index.ts';
import { PageSpanProcessor } from '../../../../../processors/index.ts';
import { withEmbraceRoutingLegacy } from './withEmbraceRoutingLegacy.ts';

const { expect } = chai;

const history = createBrowserHistory();
const EmbraceRoute = withEmbraceRoutingLegacy(Route);

const renderReactApp = () => {
  const Switcher = () => {
    const history = useHistory();
    const handleNavigation = (path: string) => {
      history.push(path);
    };

    return (
      <Switch>
        <EmbraceRoute path="/product/:id/details">
          <ProductDetails onNavigate={handleNavigation} />
        </EmbraceRoute>
        <EmbraceRoute path="/product/:id/more-details">
          <div>Product Details Relative</div>
        </EmbraceRoute>
        <EmbraceRoute path="/product/:id">
          <Product onNavigate={handleNavigation} />
        </EmbraceRoute>
        <EmbraceRoute path="/about">
          <About onNavigate={handleNavigation} />
        </EmbraceRoute>
        <EmbraceRoute path="/">
          <Home onNavigate={handleNavigation} />
        </EmbraceRoute>
      </Switch>
    );
  };

  return render(
    <Router history={history}>
      <Switcher />
    </Router>,
  );
};

describe('ReactRouterV5Legacy', () => {
  let pageManager: EmbracePageManager;
  let memoryExporter: InMemorySpanExporter;
  let sessionPartManager: SessionPartManager;

  before(() => {
    sessionPartManager = new EmbraceSessionPartManager({
      limitManager: new EmbraceLimitManager(DEFAULT_LIMITS),
    });

    session.setGlobalManagers(sessionPartManager);

    pageManager = new EmbracePageManager();
    page.setGlobalPageManager(pageManager);

    memoryExporter = setupTestTraceExporter([
      new PageSpanProcessor({
        pageManager,
      }),
    ]);
  });

  it('create route spans', async () => {
    sessionPartManager.startSessionPart();

    expect(pageManager.getCurrentPageId()).to.be.null;
    expect(pageManager.getCurrentRoute()).to.be.null;

    const { tearDown, container } = renderReactApp();

    await runReactRouterTest({
      pageManager,
      rootElement: container,
    });

    sessionPartManager.endSessionPart();
    tearDown();

    const routeSpans = memoryExporter
      .getFinishedSpans()
      .filter((span) => span.name !== 'emb-session');
    expect(routeSpans.length).to.equal(4);
    expect(routeSpans[0].name).to.equal('/');
    expect(routeSpans[1].name).to.equal('/product/:id');
    expect(routeSpans[2].name).to.equal('/product/:id/details');
    expect(routeSpans[3].name).to.equal('/product/:id/more-details');
  });
});
