import type { SpanSessionManager } from '../../api-sessions/index.js';

export interface IdentifiableSessionLogRecordProcessorArgs {
  spanSessionManager: SpanSessionManager;
}
