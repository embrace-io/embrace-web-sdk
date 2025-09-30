import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { setupOTel } from './otel.js';

if (window.location.search.includes('noSDK')) {
  console.log('Not setting up the SDK');
} else {
  setupOTel();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
