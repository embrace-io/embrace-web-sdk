import { log } from './api-logs/index.js';
import { session } from './api-sessions/index.js';
import { trace } from './api-traces/index.js';
import { type ExtendedSpan } from './api-traces/index.js';
import { user } from './api-users/index.js';
import * as sdk from './sdk/index.js';
import { bootSDK, onReady } from './sdk/bootSDK.js';

// Making it more testable
export const init = () => {
  bootSDK({
    log,
    session,
    trace,
    user,
    sdk,
  });
};

init();

export type { ExtendedSpan };
export { sdk, session, log, trace, user, onReady };
