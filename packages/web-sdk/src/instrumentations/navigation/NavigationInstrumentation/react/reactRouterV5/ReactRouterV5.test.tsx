import type { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web';
import * as chai from 'chai';
import { createBrowserHistory } from 'history';
import { Route, Router, Switch, useHistory } from 'react-router-domv4v5';
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
