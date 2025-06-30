import React from 'react';
import ReactDOM from 'react-dom/client';
import { sdk } from '@embrace-io/web-sdk';

// Call the SDK, so it doesn't get tree-shaken out during the build process
sdk.initSDK({
  appID: '11111',
});

const App = () => <h1>Hello from React + TypeScript + Webpack!</h1>;

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(<App />);
