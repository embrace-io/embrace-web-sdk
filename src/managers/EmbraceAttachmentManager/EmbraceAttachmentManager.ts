import type {
  AttachmentManagerInternal,
  EmbraceAttachmentManagerArgs,
} from './types.js';
import { getAttachmentsURL } from './utils.js';
import type { DiagLogger } from '@opentelemetry/api';
import { diag } from '@opentelemetry/api';

export class EmbraceAttachmentManager implements AttachmentManagerInternal {
  private readonly _appID?: string;
  private readonly _attachmentsURL?: string;
  private readonly _diag: DiagLogger;

  public constructor({
    appID,
    diag: diagParam = diag.createComponentLogger({
      namespace: 'embrace-attachment-manager',
    }),
  }: EmbraceAttachmentManagerArgs = {}) {
    if (appID) {
      this._appID = appID;
      this._attachmentsURL = getAttachmentsURL(appID);
    }
    this._diag = diagParam;
  }

  public async uploadAttachment(
    attachmentID: string,
    data: string
  ): Promise<void> {
    if (!this._appID || !this._attachmentsURL) {
      this._diag.warn(`Attachment service called without having an appID`);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('app_id', this._appID);
      formData.append('attachment_id', attachmentID);
      formData.append('file', new Blob([data], { type: 'text/plain' }), 'file');

      const response = await fetch(this._attachmentsURL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        this._diag.warn(
          `Failed to upload attachment to ${this._attachmentsURL}: ${response.statusText}`
        );

        return;
      }
    } catch (error: unknown) {
      this._diag.warn(
        `Failed to upload attachment: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
