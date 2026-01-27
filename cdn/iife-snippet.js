// This is the non-minified version of the code snippet that users loading the SDK through the CDN asynchronously will use
// This code is never executed by the sdk, but we keep it as source of truth for the minified version exposed in the README file

(function () {
  try {
    if (!window.EmbraceWebSdk) {
      window.EmbraceWebSdk = { __q: [], __isProxy: true };

      console.log('Embrace Web SDK Stub Installed');

      function makeProxy(path) {
        return new Proxy(function () {}, {
          get(target, prop) {
            if (prop === '__isProxy') return true;
            return makeProxy(path.concat([prop]));
          },
          apply(target, thisArg, args) {
            window.EmbraceWebSdk.__q.push({
              path: path,
              args: Array.from(args),
            });
            return undefined;
          },
        });
      }

      Object.setPrototypeOf(window.EmbraceWebSdk, makeProxy([]));
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk@X.X.X';
    document.head.appendChild(script);
  } catch {
    // Fail silently if anything goes wrong
  }
})();
