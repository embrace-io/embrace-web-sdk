import { useRoutingDemoContext } from './RoutingDemoContext';
import { useMultiVersionNavigate } from './hooks';

const Home = () => {
  const { navigationType } = useRoutingDemoContext();
  const { navigateToPage } = useMultiVersionNavigate(navigationType);

  return (
    <div className="container">
      <h1>Home Page</h1>
      <button onClick={() => navigateToPage(`/product/${Math.random()}`)}>
        Navigate to product page
      </button>
      <button onClick={() => navigateToPage('/about')}>
        Navigate to about page
      </button>
    </div>
  );
};

export default Home;
