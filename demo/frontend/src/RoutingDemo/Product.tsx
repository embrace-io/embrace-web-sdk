import { useRoutingDemoContext } from './RoutingDemoContext';
import { Outlet } from 'react-router-domv6plus';
import { useMultiVersionNavigate } from './hooks';

const Product = () => {
  const { navigationType } = useRoutingDemoContext();
  const { navigateToPage, navigateBack } =
    useMultiVersionNavigate(navigationType);

  return (
    <div className="container">
      <h1>Product Page</h1>
      {navigationType === 'declarativeV6+' && (
        <>
          <button onClick={() => navigateToPage('comments')}>
            See comments
          </button>
          <Outlet />
        </>
      )}
      <button onClick={navigateBack}>Go Back</button>
    </div>
  );
};

export default Product;
