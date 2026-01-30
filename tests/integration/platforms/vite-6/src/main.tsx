import ReactDOM from 'react-dom/client';

import SDKTest from './SDKTest.tsx';

const App = () => {
  return (
    <>
      <h1>Hello from React + TypeScript + Vite!</h1>
      <SDKTest />
    </>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
