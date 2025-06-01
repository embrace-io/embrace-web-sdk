import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { setupOTel } from './otel.js';
import { createBrowserHistory } from 'history';
import { Route, Router, Switch } from 'react-router-dom';
import About from './About';
import { withEmbraceRouting } from '@embrace-io/web-sdk/react-instrumentation';

const history = createBrowserHistory();
const OTelRoute = withEmbraceRouting(Route);

setupOTel();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router history={history}>
      <Switch>
        <OTelRoute exact path="/">
          <App />
        </OTelRoute>
        <OTelRoute path="/about/:id">
          <About />
        </OTelRoute>
      </Switch>
    </Router>
  </StrictMode>
);
