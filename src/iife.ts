import { sdk, session, log, trace, user } from './index.js';

const queue = window.EmbraceWebSdk?.__q;

window.EmbraceWebSdk = {
  sdk,
  session,
  log,
  trace,
  user,
};

if (Array.isArray(queue)) {
  queue.forEach(call => {
    // Resolve the path to the actual function
    let target = window.EmbraceWebSdk;
    for (let i = 0; i < call.path.length - 1; i++) {
      if (target && typeof target === 'object') {
        // @ts-expect-error user input - path may be invalid
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        target = target[call.path[i]];
      } else {
        target = undefined;
        break;
      }
    }
    // @ts-expect-error user input - path may be invalid
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const fn = target && target[call.path[call.path.length - 1]];
    if (typeof fn === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      fn.apply(target, call.args);
    }
  });
}
