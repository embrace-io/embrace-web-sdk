import { NoOpUserSessionManager } from './NoOpUserSessionManager/index.ts';
import { ProxyUserSessionManager } from './ProxyUserSessionManager/index.ts';

export { NoOpUserSessionManager } from './NoOpUserSessionManager/index.ts';
export { ProxyUserSessionManager } from './ProxyUserSessionManager/index.ts';

/** @deprecated Use NoOpUserSessionManager */
export const NoOpSpanSessionManager = NoOpUserSessionManager;

/** @deprecated Use ProxyUserSessionManager */
export const ProxySpanSessionManager = ProxyUserSessionManager;

export type {
  PropertyOptions,
  SessionPartEndReason,
  SessionPartStartReason,
  SpanSessionManager,
  TerminationInfo,
  UserSessionManager,
  UserSessionTerminationReason,
} from './types.ts';
