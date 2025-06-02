import { useRoutingDemoContext } from './RoutingDemoContext';
import { useMultiVersionNavigate } from './hooks';

const About = () => {
  const { navigationType } = useRoutingDemoContext();
  const { navigateBack } = useMultiVersionNavigate(navigationType);

  return (
    <div className="container">
      <h1>About Page</h1>
      <button onClick={navigateBack}>Go Back</button>
    </div>
  );
};

export default About;
