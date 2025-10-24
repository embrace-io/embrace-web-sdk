import ReactDOM from 'react-dom/client';

import SDKTest from './SDKTest';

const App = () => {
  return (
    <>
      <h1>Hello from React + TypeScript + Webpack!</h1>
      <SDKTest />
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(<App />);
