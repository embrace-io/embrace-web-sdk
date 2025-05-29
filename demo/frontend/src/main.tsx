import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { setupOTel } from './otel.js';
import { createBrowserHistory } from 'history';
import { Route, Router } from 'react-router-dom';
import About from './About';

const history = createBrowserHistory();

setupOTel({ history });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router history={history}>
      <Route exact path="/">
        <App />
      </Route>
      <Route path="/about">
        <About />
      </Route>
    </Router>
  </StrictMode>
);
