import { useHistory as useHistoryV4V5 } from 'react-router-domv4v5';
import { useRoutingDemoContext } from './RoutingDemoContext';
import { useNavigate, Outlet } from 'react-router-domv6plus';

const Product = () => {
  const { navigationType } = useRoutingDemoContext();
  const historyV4V5 = useHistoryV4V5();
  const navigate = useNavigate();

  const handleGoBack = () => {
    switch (navigationType) {
      case 'declarativeV4V5':
        historyV4V5.goBack();
        break;
      case 'declarativeV6+':
        navigate(-1);
        break;
      default:
        console.warn('Unknown navigation type');
    }
  };

  const handleSeeComments = () => {
    navigate('comments');
  };

  return (
    <div className="container">
      <h1>Product Page</h1>
      {navigationType === 'declarativeV6+' && (
        <>
          <button onClick={handleSeeComments}>See comments</button>
          <Outlet />
        </>
      )}
      <button onClick={handleGoBack}>Go Back</button>
    </div>
  );
};

export default Product;
