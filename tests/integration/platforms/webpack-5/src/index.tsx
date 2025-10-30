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

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
