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
import { SpanSessionManager } from '../../../api-sessions/index.js';

import { ClicksInstrumentationArgs } from './types.js';
import { getHTMLElementFriendlyName } from './utils.js';

export class ClicksInstrumentation extends InstrumentationBase {
  private readonly _spanSessionManager: SpanSessionManager;

  constructor({ spanSessionManager }: ClicksInstrumentationArgs) {
    super('ClicksInstrumentation', '1.0.0', {});
    this._spanSessionManager = spanSessionManager;

    if (this._config.enabled) {
      this.enable();
    }
  }

  /**
   * Creates a new span event
   * @param event
   */
  private _createSpanEvent(event: MouseEvent) {
    const element = event.target;

    if (!(element instanceof HTMLElement)) {
      return undefined;
    }
    if (!element.getAttribute) {
      return undefined;
    }
    if (element.hasAttribute('disabled')) {
      return undefined;
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
          Date.now()
        );
        this._spanSessionManager.endSessionSpan();
      }
    } catch (e) {
      this._diag.error('failed to create new user interaction span event', e);
    }
  }

  private _clickEventListener(ev: MouseEvent) {
    this._createSpanEvent(ev);
  }

  enable(): void {
    document.addEventListener('click', this._clickEventListener.bind(this));
  }

  disable(): void {
    document.removeEventListener('click', this._clickEventListener.bind(this));
  }

  // no-op
  protected init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    | void {
    return;
  }
}
