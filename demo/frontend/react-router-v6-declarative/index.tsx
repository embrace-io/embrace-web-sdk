import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Route,
  Routes,
  BrowserRouter,
  useNavigate,
  useParams,
  Outlet,
} from 'react-router-domv6plus';
import { withEmbraceRouting } from '@embrace-io/web-sdk/react-instrumentation';
import '../src/index.css';
import { init, getBasename, exit } from '../src/utils';

init();

const EmbraceRoutes = withEmbraceRouting(Routes);

const Home = () => {
  const navigate = useNavigate();

  return (
    <fieldset style={{ gridColumn: '1 / -1' }}>
      <legend>Home Page</legend>
      <div className="nav-buttons">
        <button
          onClick={() =>
            navigate(`/product/${Math.floor(Math.random() * 100)}`)
          }
        >
          Go to Product Page
        </button>
        <button onClick={() => navigate('/about')}>Go to About Page</button>
      </div>
      <p>React Router v6 Declarative Demo</p>
    </fieldset>
  );
};

const Product = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  return (
    <fieldset style={{ gridColumn: '1 / -1' }}>
      <legend>Product Page</legend>
      <div className="nav-buttons">
        <button onClick={() => navigate('/')}>Go to Home Page</button>
        <button onClick={() => navigate('/about')}>Go to About Page</button>
      </div>
      <p>Product ID: {id}</p>
      <button onClick={() => navigate('comments')}>See Comments</button>
      <Outlet />
    </fieldset>
  );
};

const ProductComments = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '1rem',
        border: '1px solid #27272a',
        borderRadius: '6px',
      }}
    >
      <h3 style={{ color: '#c7f000', margin: '0 0 0.5rem 0' }}>
        Product Comments
      </h3>
      <p>This is a nested route example</p>
      <div className="nav-buttons">
        <button onClick={() => navigate('..')}>Close Comments</button>
      </div>
    </div>
  );
};

const About = () => {
  const navigate = useNavigate();

  return (
    <fieldset style={{ gridColumn: '1 / -1' }}>
      <legend>About Page</legend>
      <div className="nav-buttons">
        <button onClick={() => navigate('/')}>Go to Home Page</button>
      </div>
      <h3>React Router v6 Declarative Instrumentation</h3>
      <p>
        This demo showcases Embrace's automatic route tracking for React Router
        v6 applications using the declarative routing API. The instrumentation
        uses <code>withEmbraceRouting</code> to wrap the Routes component,
        automatically capturing all navigation events and route changes.
      </p>
      <p>
        Every route transition is tracked as a span in OpenTelemetry, providing
        visibility into user navigation patterns, page load times, and potential
        routing issues. This includes support for nested routes, allowing you to
        understand the full navigation hierarchy.
      </p>
      <p>
        The instrumentation captures route paths, parameters, and timing
        information without requiring manual span creation. Simply wrap your
        Routes component and all navigation is automatically tracked.
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
        <h1>[••] demo</h1>
        <h2>React Router v6 Declarative</h2>
        <BrowserRouter basename={getBasename('react-router-v6-declarative')}>
          <EmbraceRoutes>
            <Route path="/" element={<Home />} />
            <Route path="/product/:id" element={<Product />}>
              <Route path="comments" element={<ProductComments />} />
              <Route path="photos" element={<ProductComments />} />
            </Route>
            <Route path="/about" element={<About />} />
          </EmbraceRoutes>
        </BrowserRouter>
      </div>
    </>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
