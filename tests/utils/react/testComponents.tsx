import type { FC } from 'react';

type PageProps = {
  onNavigate: (path: string) => void;
};

export const Home: FC<PageProps> = ({ onNavigate }) => {
  return (
    <div>
      <h1>Home</h1>
      <button
        id="to-product-button"
        type="button"
        onClick={() =>
          onNavigate(`/product/${Math.floor(Math.random() * 100)}`)
        }
      >
        Go to Product Page
      </button>
      <button type="button" onClick={() => onNavigate('/about')}>
        Go to About Page
      </button>
    </div>
  );
};

export const Product: FC<PageProps> = ({ onNavigate }) => {
  return (
    <div>
      <h1>Product</h1>
      <button type="button" onClick={() => onNavigate('/')}>
        Go to Home Page
      </button>
      <button type="button" onClick={() => onNavigate('/about')}>
        Go to About Page
      </button>
    </div>
  );
};

export const About: FC<PageProps> = ({ onNavigate }) => {
  return (
    <div>
      <h1>About</h1>
      <button type="button" onClick={() => onNavigate('/')}>
        Go to Home Page
      </button>
    </div>
  );
};
