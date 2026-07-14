import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace';
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

  // Read the userId in onEnding to catch an identity set after the span started.
  public onEnding(span: Span): void {
    const userId = this._userManager.getUserId();

    if (userId) {
      span.attributes[ATTR_USER_ID] = userId;
    }
  }

  public onStart(this: void): void {
    // do nothing.
  }

  public onEnd(this: void): void {
    // do nothing.
  }

  public shutdown(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
