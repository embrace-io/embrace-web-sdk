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

import type { InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { EmbraceInstrumentationBase } from '../../session/index.js';
import type { ClicksInstrumentationArgs } from './types.js';

import { getHTMLElementFriendlyName } from './utils.js';

export class ClicksInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onClickHandler: (event: MouseEvent) => void;

  public constructor({ diag, perf }: ClicksInstrumentationArgs = {}) {
    super({
      instrumentationName: 'SpanSessionBrowserActivityInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {}
    });

    this._onClickHandler = (event: MouseEvent) => {
      const element = event.target;

      if (!(element instanceof HTMLElement)) {
        return;
      }
      if (element.hasAttribute('disabled')) {
        return;
      }

      try {
        const currentSessionSpan = this.sessionManager.getSessionSpan();
        if (currentSessionSpan) {
          currentSessionSpan.addEvent(
            'click',
            {
              'emb.type': 'ux.tap',
              'view.name': getHTMLElementFriendlyName(element),
              'tap.coords': `${event.x.toString()},${event.y.toString()}`
            },
            this.perf.epochMillisFromOriginOffset(event.timeStamp)
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

  public disable(): void {
    document.removeEventListener('click', this._onClickHandler);
  }

  public enable(): void {
    document.addEventListener('click', this._onClickHandler);
  }

  // no-op
  protected override init():
    | InstrumentationModuleDefinition
    | InstrumentationModuleDefinition[]
    // NOTE: disabling typescript check, as this class was copied from OTel repo.
    // TBH, I agree with typescript here, but keeping it disabled for consistency with the base repo
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    | void {
    return;
  }
}
