import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { createBrowserHistory } from 'history';
import { Route, Router, Switch, useHistory } from 'react-router-domv4v5';
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
import { runReactRouterTest } from '../../../../../testUtils/react/sharedTests';
import {
  About,
  Home,
  Product,
} from '../../../../../testUtils/react/testComponents';
import { withEmbraceRoutingLegacy } from './withEmbraceRoutingLegacy';

const { expect } = chai;

export const history = createBrowserHistory();
const EmbraceRoute = withEmbraceRoutingLegacy(Route);

const renderReactApp = () => {
  const Switcher = () => {
    const history = useHistory();
    const handleNavigation = (path: string) => {
      history.push(path);
    };

    return (
      <Switch>
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
