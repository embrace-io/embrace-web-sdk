/// <reference types="vite/client" />
import { withEmbraceRoutingLegacy } from '@embrace-io/web-sdk/react-instrumentation';
import { createBrowserHistory } from 'history';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Route,
  Router,
  Switch,
  useHistory,
  useParams,
} from 'react-router-domv4v5';
import logo from '../public/logo.png';
import '../src/index.css';
import { setupOTel } from '../src/otel';
import { getBasename } from '../src/utils';

setupOTel();

const EmbraceRoute = withEmbraceRoutingLegacy(Route);
const history = createBrowserHistory({
  basename: getBasename('react-router-v5'),
});

const Home = () => {
  const history = useHistory();

  return (
    <fieldset style={{ gridColumn: '1 / -1' }}>
      <legend>Home Page</legend>
      <div className="nav-buttons">
        <button
          onClick={() =>
            history.push(`/product/${Math.floor(Math.random() * 100)}`)
          }
        >
          Go to Product Page
        </button>
        <button onClick={() => history.push('/about')}>Go to About Page</button>
      </div>
      <p>React Router v4/v5 Demo</p>
    </fieldset>
  );
};

const Product = () => {
  const history = useHistory();
  const { id } = useParams<{ id: string }>();

  return (
    <fieldset style={{ gridColumn: '1 / -1' }}>
      <legend>Product Page</legend>
      <div className="nav-buttons">
        <button onClick={() => history.push('/')}>Go to Home Page</button>
        <button onClick={() => history.push('/about')}>Go to About Page</button>
      </div>
      <p>Product ID: {id}</p>
    </fieldset>
  );
};

const About = () => {
  const history = useHistory();

  return (
    <fieldset style={{ gridColumn: '1 / -1' }}>
      <legend>About Page</legend>
      <div className="nav-buttons">
        <button onClick={() => history.push('/')}>Go to Home Page</button>
      </div>
      <h3>React Router v4/v5 Instrumentation</h3>
      <p>
        This demo showcases Embrace's automatic route tracking for React Router
        v4 and v5 applications. The instrumentation uses{' '}
        <code>withEmbraceRoutingLegacy</code> to wrap Route components,
        automatically capturing navigation events and route changes.
      </p>
      <p>
        Every route transition is tracked as a span in OpenTelemetry, providing
        visibility into user navigation patterns, page load times, and potential
        routing issues. This helps identify performance bottlenecks and
        understand how users interact with your application.
      </p>
      <p>
        The instrumentation captures route paths, parameters, and timing
        information without requiring manual span creation or complex setup.
      </p>
    </fieldset>
  );
};

const App = () => {
  return (
    <>
      <a href={import.meta.env.BASE_URL} className="exit-link">
        <span>←</span>
        <span>Exit Router Demo</span>
      </a>
      <div className="container">
        <a href={import.meta.env.BASE_URL} className="logo-link">
          <img src={logo} alt="Embrace" />
        </a>
        <h1>React Router v4/v5</h1>
        <Router history={history}>
          <Switch>
            <EmbraceRoute exact path="/" component={Home} />
            <EmbraceRoute path="/product/:id" component={Product} />
            <EmbraceRoute path="/about" component={About} />
          </Switch>
        </Router>
      </div>
    </>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
