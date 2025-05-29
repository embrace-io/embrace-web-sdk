import { useHistory } from 'react-router-dom';

const About = () => {
  const history = useHistory();

  return (
    <>
      <div>This is a different page</div>
      <button onClick={history.goBack}>Go Back!</button>
    </>
  );
};

export default About;
