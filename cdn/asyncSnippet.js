// This is the non-minified version of the code snippet that users loading the SDK through the CDN asynchronously will use
// This code is never executed by the sdk, but we keep it as source of truth for the minified version exposed in the README file
(() => {
  window.EmbraceWebSdkOnReady = window.EmbraceWebSdkOnReady || {
    q: [],
    onReady: (fn) => {
      window.EmbraceWebSdkOnReady.q.push(fn);
    },
  };
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = "anonymous"
  script.src = 'https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk@X.X.X';
  script.onload = () => {
    window.EmbraceWebSdkOnReady.q.forEach((fn) => {
      fn();
    });
    window.EmbraceWebSdkOnReady.q = [];
    // Call onReady immediately if the SDK is already loaded
    window.EmbraceWebSdkOnReady.onReady = (fn) => {
      fn();
    };
  };
  const firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(script, firstScript);
})();
