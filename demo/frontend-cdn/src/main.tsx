import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { setupOTel } from './otel.ts';

const ASYNC_MODE = import.meta.env.VITE_ASYNC_MODE === 'true';

if (ASYNC_MODE) {
  // @ts-expect-error
  window.EmbraceWebSdkOnReady.onReady(() => {
    setupOTel();
  });
} else {
  setupOTel();
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
