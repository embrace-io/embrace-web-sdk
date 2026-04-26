import type { SessionPartManager } from '../../api-sessions/index.ts';
import type { UserSessionLifecycleManager } from '../../managers/EmbraceUserSessionManager/index.ts';

export interface UserSessionSpanProcessorArgs {
  userSessionManager: UserSessionLifecycleManager;
  sessionPartManager: SessionPartManager;
}
