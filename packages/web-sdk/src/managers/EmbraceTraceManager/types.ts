import type { TraceManagerArgs } from '../../api-traces/index.ts';
import type { UserSessionManagerInternal } from '../EmbraceUserSessionManager/index.ts';

export interface EmbraceTraceManagerArgs extends TraceManagerArgs {
  userSessionManager?: UserSessionManagerInternal;
}
