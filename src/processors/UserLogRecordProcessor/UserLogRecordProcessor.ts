import type { LogRecord } from '@opentelemetry/sdk-logs';
import { type LogRecordProcessor } from '@opentelemetry/sdk-logs';
import { ATTR_USER_ID } from '@opentelemetry/semantic-conventions/incubating';
import type { UserLogRecordProcessorArgs } from './types.js';
import type { UserManager } from '../../api-users/index.js';

/**
 * UserLogRecordProcessor sets the userId attribute on all log records if the userId is set in the UserManager.
 */
export class UserLogRecordProcessor implements LogRecordProcessor {
  private readonly _userManager: UserManager;

  public constructor({ userManager }: UserLogRecordProcessorArgs) {
    this._userManager = userManager;
  }

  // no-op
  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  public onEmit(logRecord: LogRecord) {
    const userId = this._userManager.getUserId();

    if (userId) {
      logRecord.setAttributes({
        [ATTR_USER_ID]: this._userManager.getUserId(),
      });
    }
  }

  // no-op
  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
