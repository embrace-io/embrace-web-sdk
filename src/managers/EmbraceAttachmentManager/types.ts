import type { DiagLogger } from '@opentelemetry/api';

export interface EmbraceAttachmentManagerArgs {
  appID?: string;
  diag?: DiagLogger;
}

export interface AttachmentManagerInternal {
  uploadAttachment: (attachmentID: string, data: string) => Promise<void>;
}
