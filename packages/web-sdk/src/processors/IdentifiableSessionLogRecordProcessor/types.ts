import type { SpanSessionManagerInternal } from '../../managers/EmbraceSpanSessionManager/index.ts';

export interface IdentifiableSessionLogRecordProcessorArgs {
  spanSessionManager: SpanSessionManagerInternal;
}
