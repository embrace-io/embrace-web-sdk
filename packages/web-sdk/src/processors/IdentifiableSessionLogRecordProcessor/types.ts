import type { UserSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/index.ts';

export interface IdentifiableSessionLogRecordProcessorArgs {
  userSessionManager: UserSessionManagerInternal;
}
