import { Link, useParams } from 'react-router';

const ProductDetail = () => {
  const { productId } = useParams();

  return (
    <main>
      <h1>Product {productId}</h1>
      <nav>
        <Link to="/products">Back to Products</Link>
        <Link to="/">Home</Link>
      </nav>
    </main>
  );
};

export default ProductDetail;
