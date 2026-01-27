// This is the non-minified version of the code snippet that users loading the SDK through the CDN asynchronously will use
// This code is never executed by the sdk, but we keep it as source of truth for the minified version exposed in the README file
(function () {
  window.__embrace__ = [];

  window.onEmbraceReady = window.__embrace__.push(cb);

  // window.__embrace__ = function () {
  //   ready = true;
  //   readyCallbacks.forEach(cb => {
  //     try {
  //       cb();
  //     } catch {}
  //   });
  //   readyCallbacks = [];
  // };

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk@X.X.X';
  document.head.appendChild(script);
})();

// source for one-liner
(function (e, m, b, r, c) {
  let d = 0;
  let rc = [];

  b[e] = cb => {
    if (d) cb();
    else rc.push(cb);
  };

  b[m] = () => {
    d = 1;
    rc.forEach(cb => {
      try {
        cb();
      } catch {}
    });
    rc = [];
  };
  const s = r.createElement('script');
  s.async = true;
  s.src = c;
  r.head.appendChild(s);
})(
  'onEmbraceReady',
  '__embrace__',
  window,
  document,
  'https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk@X.X.X'
);

// one-liner
// prettier-ignore
(function(e,m,b,r,c){let d=0;let rc=[];b[e]=cb=>{if(d)cb();else rc.push(cb)};b[m]=()=>{d=1;rc.forEach(cb=>{try{cb()}catch{}});rc=[]};const s=r.createElement('script');s.async=!0;s.src=c;r.head.appendChild(s)})('onEmbraceReady','__embrace__',window,document,'https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk@X.X.X')
