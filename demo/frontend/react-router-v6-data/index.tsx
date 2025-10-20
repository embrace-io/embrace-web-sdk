import React, { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  RouterProvider,
  matchRoutes,
  useNavigate,
  useParams,
  Outlet,
} from 'react-router-domv6plus';
import { listenToRouterChanges } from '@embrace-io/web-sdk/react-instrumentation';
import '../src/index.css';
import { init, getBasename, exit } from '../src/utils';

init();

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
      <p>React Router v6 Data Demo</p>
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
      <h3 style={{ color: '#eeff04', margin: '0 0 0.5rem 0' }}>
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
      <h3>React Router v6 Data API Instrumentation</h3>
      <p>
        This demo showcases Embrace's automatic route tracking for React Router
        v6 applications using the data router API (createBrowserRouter). The
        instrumentation uses <code>listenToRouterChanges</code>
        to monitor the router instance, automatically capturing all navigation
        events and route changes.
      </p>
      <p>
        The data router API provides advanced features like data loading,
        actions, and error boundaries. Our instrumentation seamlessly integrates
        with these features, tracking route transitions as OpenTelemetry spans
        while preserving all router functionality.
      </p>
      <p>
        Every route transition is tracked with detailed timing information,
        route paths, and parameters. This provides visibility into user
        navigation patterns, page load times, and helps identify performance
        bottlenecks in your application's routing layer.
      </p>
    </fieldset>
  );
};

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Home />,
    },
    {
      path: '/product/:id',
      element: <Product />,
      children: [
        {
          path: 'comments',
          element: <ProductComments />,
        },
        {
          path: 'photos',
          element: <ProductComments />,
        },
      ],
    },
    {
      path: '/about',
      element: <About />,
    },
  ],
  { basename: getBasename('react-router-v6-data') }
);

const App = () => {
  useEffect(() => {
    return listenToRouterChanges({
      router,
      routesMatcher: matchRoutes,
    });
  }, []);

  return (
    <>
      <a href={import.meta.env.BASE_URL} className="exit-link">
        <span>←</span>
        <span>Exit Router Demo</span>
      </a>
      <div className="container">
        <h1>[••] demo</h1>
        <h2>React Router v6 Data API</h2>
        <RouterProvider router={router} />
      </div>
    </>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
