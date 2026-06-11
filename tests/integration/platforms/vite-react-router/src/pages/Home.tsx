import { Link } from 'react-router';

const Home = () => {
  return (
    <main>
      <h1>Home</h1>
      <nav>
        <Link to="/products">Products</Link>
      </nav>
    </main>
  );
};

export default Home;
