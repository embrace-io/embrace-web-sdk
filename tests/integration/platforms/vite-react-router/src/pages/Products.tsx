import { Link } from 'react-router';

const PRODUCTS = [
  { id: '1', name: 'Product One' },
  { id: '2', name: 'Product Two' },
  { id: '3', name: 'Product Three' },
];

const Products = () => {
  return (
    <main>
      <h1>Products</h1>
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <ul>
        {PRODUCTS.map((product) => (
          <li key={product.id}>
            <Link to={`/products/${product.id}`}>{product.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
};

export default Products;
