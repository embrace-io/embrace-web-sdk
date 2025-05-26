import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import Sonda from 'sonda/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), Sonda()],
  build: {
    sourcemap: true,
  },
});
