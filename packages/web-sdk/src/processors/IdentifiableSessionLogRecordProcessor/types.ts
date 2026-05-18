import type { SpanSessionManagerInternal } from '../../managers/EmbraceUserSessionManager/index.ts';

export interface IdentifiableSessionLogRecordProcessorArgs {
  spanSessionManager: SpanSessionManagerInternal;
}
