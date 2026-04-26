import { NoOpUserSessionManager } from './NoOpUserSessionManager/index.ts';
import { ProxyUserSessionManager } from './ProxyUserSessionManager/index.ts';

export { NoOpSessionPartManager } from './NoOpSessionPartManager/index.ts';
export { NoOpUserSessionManager } from './NoOpUserSessionManager/index.ts';
export { ProxySessionPartManager } from './ProxySessionPartManager/index.ts';
export { ProxyUserSessionManager } from './ProxyUserSessionManager/index.ts';

/** @deprecated Use NoOpUserSessionManager */
export const NoOpSpanSessionManager = NoOpUserSessionManager;

/** @deprecated Use ProxyUserSessionManager */
export const ProxySpanSessionManager = ProxyUserSessionManager;

export type {
  PropertyOptions,
  SessionPartEndReason,
  SessionPartManager,
  SessionPartStartReason,
  SpanSessionManager,
  UserSessionManager,
} from './types.ts';
