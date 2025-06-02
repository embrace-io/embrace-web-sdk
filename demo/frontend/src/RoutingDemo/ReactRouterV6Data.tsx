import {
  createBrowserRouter,
  RouterProvider,
  matchRoutes,
} from 'react-router-domv6plus';
import Home from './Home';
import Product from './Product';
import ProductComments from './ProductComments';
import About from './About';
import { useRoutingDemoContext } from './RoutingDemoContext';
import { listenToRouterChanges } from '@embrace-io/web-sdk/react-instrumentation';
import { useEffect } from 'react';

const router = createBrowserRouter([
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
]);

const ReactRouterV6Data = () => {
  const { setNavigationType } = useRoutingDemoContext();
  const handleExitNavigationDemo = () => {
    setNavigationType(null);
    window.location.href = '/';
  };

  useEffect(() => {
    return listenToRouterChanges({
      router,
      routesMatcher: matchRoutes,
    });
  }, []);

  return (
    <div className="container">
      <RouterProvider router={router} />
      <button onClick={handleExitNavigationDemo}>Exit navigation demo</button>
    </div>
  );
};

export default ReactRouterV6Data;
