import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { setupOTel } from './otel.js';

const ASYNC_MODE = import.meta.env.VITE_ASYNC_MODE === 'true';

if (ASYNC_MODE) {
  // @ts-ignore
  window.EmbraceWebSdkOnReady.onReady(() => {
    setupOTel();
  });
} else {
  setupOTel();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
