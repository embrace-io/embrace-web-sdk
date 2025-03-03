/*
  This instrumentation is taking code from here as a starting point:
    https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/web/opentelemetry-instrumentation-user-interaction/src/instrumentation.ts

  But not using that instrumentation directly because:

    1) We want to record clicks as span events on the Session span
    2) There is a bug with the instrumentation that causes a large number of spans to be created for a single click
      when zone context isn't available. To avoid the bug we take a simpler approach here and add a listener directly
      to `document` rather than trying to patch the `addEventListener` method on the prototype, this does mean we miss
      recording click events for which `stopPropagation` is called.
 */

import { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { InstrumentationBase } from '../../InstrumentationBase/index.js';
import { session, SpanSessionManager } from '../../../api-sessions/index.js';

import { getHTMLElementFriendlyName } from './utils.js';
import { epochMillisFromOriginOffset } from '../../../utils/getNowHRTime/getNowHRTime.js';

export class ClicksInstrumentation extends InstrumentationBase {
  private readonly _spanSessionManager: SpanSessionManager;
  private readonly _onClickHandler: (event: MouseEvent) => void;

  constructor() {
    super('ClicksInstrumentation', '1.0.0', {});
    this._spanSessionManager = session.getSpanSessionManager();

    this._onClickHandler = (event: MouseEvent) => {
      const element = event.target;

      if (!(element instanceof HTMLElement)) {
        return;
      }
      if (!element.getAttribute) {
        return;
      }
      if (element.hasAttribute('disabled')) {
        return;
      }

      try {
        const currentSessionSpan = this._spanSessionManager.getSessionSpan();
        if (currentSessionSpan) {
          currentSessionSpan.addEvent(
            'click',
            {
              'emb.type': 'ux.tap',
              'view.name': getHTMLElementFriendlyName(element),
              'tap.coords': `${event.x},${event.y}`,
            },
            epochMillisFromOriginOffset(event.timeStamp)
          );
        }
      } catch (e) {
        this._diag.error('failed to create new user interaction span event', e);
      }
    };

    if (this._config.enabled) {
      this.enable();
    }
  }

  enable(): void {
    document.addEventListener('click', this._onClickHandler);
  }

  disable(): void {
    if (this._onClickHandler) {
      document.removeEventListener('click', this._onClickHandler);
    }
  }

  // no-op
  protected init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    | void {
    return;
  }
}
