import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const ASYNC_MODE = process.env.VITE_ASYNC_MODE === 'true';
const SYNC_BUNDLE = `<script src="/bundle.js"></script>`;
const ASYNC_BUNDLE = `
  <script>
  (function(e,m,b) {
        e.EmbraceWebSdk=e.EmbraceWebSdk||{q:[],onReady:function(f){e.EmbraceWebSdk.q.push(f);}};
        s=m.createElement(b);s.async=1;s.src="./bundle.js";
        b=m.getElementsByTagName(b)[0];b.parentNode.insertBefore(s,b);
      })(window, document, "script");
  </script>
`;

const htmlPlugin = () => {
  return {
    name: 'html-transform',
    transformIndexHtml(html: string) {
      return html.replace(
        /<!-- async_sync_placeholder -->/,
        ASYNC_MODE ? ASYNC_BUNDLE : SYNC_BUNDLE
      );
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), htmlPlugin()],
  build: {
    sourcemap: true,
  },
});
