import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../frontend/src/App.tsx';
import '../../frontend/src/index.css';
import { setupOTel } from './otel.ts';
import { initSpatialNav } from './spatialNav.ts';
import './webos.css';

setupOTel();
initSpatialNav();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
