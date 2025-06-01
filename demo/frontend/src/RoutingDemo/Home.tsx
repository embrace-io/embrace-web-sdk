import { useHistory as useHistoryV4V5 } from 'react-router-domv4v5';
import { useRoutingDemoContext } from './RoutingDemoContext';
import { useNavigate } from 'react-router-domv6plus';

const Home = (props: object) => {
  const { navigationType } = useRoutingDemoContext();
  const historyV4V5 = useHistoryV4V5();
  const navigate = useNavigate();

  console.log('props', props);

  const handleNavigateToPage = (page: string) => () => {
    switch (navigationType) {
      case 'declarativeV4V5':
        historyV4V5.push(page);
        break;
      case 'declarativeV6+':
        navigate(page);
        break;
      default:
        console.warn('Unknown navigation type');
    }
  };

  return (
    <div className="container">
      <h1>Home Page</h1>
      <button onClick={handleNavigateToPage(`/product/${Math.random()}`)}>
        Navigate to product page
      </button>
      <button onClick={handleNavigateToPage('/about')}>
        Navigate to about page
      </button>
    </div>
  );
};

export default Home;
