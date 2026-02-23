import type { SpanSessionManager } from '../../api-sessions/index.ts';

export interface IdentifiableSessionLogRecordProcessorArgs {
  spanSessionManager: SpanSessionManager;
}
