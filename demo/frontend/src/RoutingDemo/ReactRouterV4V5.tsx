import { Route, Router, Switch } from 'react-router-domv4v5';
import { withEmbraceRoutingLegacy } from '@embrace-io/web-sdk/react-instrumentation';
import Home from './Home';
import Product from './Product';
import { createBrowserHistory } from 'history';
import { useRoutingDemoContext } from './RoutingDemoContext';
import About from './About';

const EmbraceRoute = withEmbraceRoutingLegacy(Route);

const history = createBrowserHistory();

const ReactRouterV4V5 = () => {
  const { setNavigationType } = useRoutingDemoContext();
  const handleExitNavigationDemo = () => {
    setNavigationType(null);
    window.location.href = '/';
  };

  return (
    <div className="container">
      {/*Adding ts-ignore because typescript is using the latest react-router types and they don't match with v4/v5*/}
      {/*@ts-ignore*/}
      <Router history={history}>
        <Switch>
          {/*@ts-ignore*/}
          <EmbraceRoute exact path="/" component={Home} />
          {/*@ts-ignore*/}
          <EmbraceRoute path="/product/:id" component={Product} />
          {/*@ts-ignore*/}
          <EmbraceRoute path="/about" component={About} />
        </Switch>
        <button onClick={handleExitNavigationDemo}>Exit navigation demo</button>
      </Router>
    </div>
  );
};

export default ReactRouterV4V5;
