import type { UserSessionLifecycleManager } from '../../managers/EmbraceUserSessionManager/index.ts';

export interface UserSessionLogRecordProcessorArgs {
  userSessionManager: UserSessionLifecycleManager;
}
