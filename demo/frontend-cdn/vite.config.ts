import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const ASYNC_MODE = process.env.VITE_ASYNC_MODE === 'true';
const SYNC_BUNDLE = `<script src="/bundle.js"></script>`;
const ASYNC_BUNDLE = `
  <script>
    !function(){window.EmbraceWebSdkOnReady=window.EmbraceWebSdkOnReady||{q:[],onReady:function(e){window.EmbraceWebSdkOnReady.q.push(e)}};let e=document.createElement("script");e.async=!0,e.src="./bundle.js",e.onload=function(){window.EmbraceWebSdkOnReady.q.forEach(e=>e()),window.EmbraceWebSdkOnReady.q=[],window.EmbraceWebSdkOnReady.onReady=function(e){e()}};let n=document.getElementsByTagName("script")[0];n.parentNode.insertBefore(e,n)}();
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
