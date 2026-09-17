import ReactDOM from 'react-dom/client';

import SDKTest from './SDKTest.tsx';

const App = () => {
  return (
    <>
      {/* Fixed-size block so the LCP element's bounding rect is identical
          across browsers; a text heading's box height drifts with the
          browser's default font, making the golden nondeterministic. */}
      <div style={{ width: '600px', height: '400px' }}>
        Hello from React + TypeScript + Vite!
      </div>
      <SDKTest />
    </>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
