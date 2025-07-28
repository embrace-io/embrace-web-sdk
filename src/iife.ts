import * as EmbraceWebSdk from './index.js';

declare global {
  interface Window {
    EmbraceWebSdk?: typeof EmbraceWebSdk;
  }
}

window.EmbraceWebSdk = EmbraceWebSdk;
