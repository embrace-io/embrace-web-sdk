import type { DiagLogger } from '@opentelemetry/api';
import type { PerformanceManager } from '../../utils/index.js';
import type { LimitManagerInternal } from '../EmbraceLimitManager/index.js';
import type { SpanSessionManagerInternal } from '../EmbraceSpanSessionManager/index.js';
import type { AttachmentManagerInternal } from '../EmbraceAttachmentManager/index.js';
import type { EmbraceRecordingManager } from '../EmbraceRecordingManager/index.js';

export interface EmbraceLogManagerArgs {
  diag?: DiagLogger;
  perf?: PerformanceManager;
  spanSessionManager: SpanSessionManagerInternal;
  limitManager: LimitManagerInternal;
  recordingManager: EmbraceRecordingManager;
  attachmentManager: AttachmentManagerInternal;
}
