import { Route, Routes, BrowserRouter } from 'react-router-domv6plus';
import Home from './Home';
import Product from './Product';
import { useRoutingDemoContext } from './RoutingDemoContext';
import About from './About';
import ProductComments from './ProductComments';
import { withEmbraceRouting } from '@embrace-io/web-sdk/react-instrumentation';

const EmbraceRoutes = withEmbraceRouting(Routes);

// Use BASE_URL from Vite for GitHub Pages support
const basename =
  import.meta.env.BASE_URL !== '/' ? import.meta.env.BASE_URL : undefined;

const ReactRouterV6Declarative = () => {
  const { setNavigationType } = useRoutingDemoContext();
  const handleExitNavigationDemo = () => {
    setNavigationType(null);
    window.location.assign(import.meta.env.BASE_URL);
  };

  return (
    <div className="container">
      <BrowserRouter basename={basename}>
        <EmbraceRoutes>
          <Route path="/" element={<Home />} />
          <Route path="/product/:id" element={<Product />}>
            <Route path="comments" element={<ProductComments />} />
            <Route path="photos" element={<ProductComments />} />
          </Route>
          <Route path="/about" element={<About />} />
        </EmbraceRoutes>
        <button onClick={handleExitNavigationDemo}>Exit navigation demo</button>
      </BrowserRouter>
    </div>
  );
};

export default ReactRouterV6Declarative;
