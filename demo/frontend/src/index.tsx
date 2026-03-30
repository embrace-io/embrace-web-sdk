import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Layout } from './Layout.tsx';
import { setupOTel } from './otel.ts';

setupOTel();

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <Layout>
        <App />
      </Layout>
    </StrictMode>,
  );
}
