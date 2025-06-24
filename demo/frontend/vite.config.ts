import { defineConfig } from 'vite';
import Sonda from 'sonda/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [Sonda({ enabled: false })],
  build: {
    sourcemap: true,
  },
});
