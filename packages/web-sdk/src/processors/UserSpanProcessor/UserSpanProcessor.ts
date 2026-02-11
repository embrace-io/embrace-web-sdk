import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import { ATTR_USER_ID } from '@opentelemetry/semantic-conventions/incubating';
import type { UserManager } from '../../api-users/index.ts';
import type { UserSpanProcessorArgs } from './types.ts';

/**
 * UserSpanProcessor sets the userId attribute on all spans if the userId is set in the UserManager.
 */
export class UserSpanProcessor implements SpanProcessor {
  private readonly _userManager: UserManager;

  public constructor({ userManager }: UserSpanProcessorArgs) {
    this._userManager = userManager;
  }

  public forceFlush(): Promise<void> {
    return Promise.resolve(undefined);
  }

  // TODO `onEnd` is not supposed to modify the span. There is a new experimental onEnding api that allows modifying
  // using onEnd to make sure we get the userId at the last possible moment in case it was set up after the span was started.
  public onEnd(span: ReadableSpan): void {
    const userId = this._userManager.getUserId();

    if (userId) {
      span.attributes[ATTR_USER_ID] = userId;
    }
  }

  public onStart(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
