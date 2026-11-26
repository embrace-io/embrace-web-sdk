/*
  This instrumentation is taking code from here as a starting point:
    https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/plugins/web/opentelemetry-instrumentation-user-interaction/src/instrumentation.ts

  But not using that instrumentation directly because:

    1) We want to record clicks as span events on the Session span
    2) There is a bug with the instrumentation that causes a large number of spans to be created for a single click
      when zone context isn't available. To avoid the bug we take a simpler approach here and add a listener directly
      to `document` rather than trying to patch the `addEventListener` method on the prototype, this does mean we miss
      recording click events for which `stopPropagation` is called. See https://github.com/open-telemetry/opentelemetry-js-contrib/issues/1368
 */

import type { Attributes } from '@opentelemetry/api';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { ClicksInstrumentationArgs } from './types.ts';

import {
  getClickElementId,
  getClickLabel,
  getHTMLElementFriendlyName,
} from './utils.ts';

export class ClicksInstrumentation extends EmbraceInstrumentationBase {
  private readonly _onClickHandler: (event: MouseEvent) => void;

  public constructor({
    diag,
    perf,
    shouldTrack,
    innerTextForElement,
  }: ClicksInstrumentationArgs = {}) {
    super({
      instrumentationName: 'ClicksInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._onClickHandler = (event: MouseEvent) => {
      const element = event.target;

      if (!(element instanceof HTMLElement)) {
        return;
      }
      if (element.hasAttribute('disabled')) {
        return;
      }

      if (shouldTrack && !shouldTrack(element)) {
        return;
      }

      try {
        const currentSessionPartSpan =
          this.userSessionManager.getSessionPartSpan();
        if (currentSessionPartSpan) {
          const attributes: Attributes = {
            'emb.type': 'ux.tap',
            'view.name': getHTMLElementFriendlyName(
              element,
              innerTextForElement
                ? innerTextForElement(element)
                : // innerText, not textContent: capture what the user sees
                  element.innerText,
            ),
            'tap.coords': `${event.x.toString()},${event.y.toString()}`,
          };
          // Stable across builds, unlike the class names in view.name, so User Flows can match clicks on them.
          const label = getClickLabel(element);
          if (label) {
            attributes['emb.click.label'] = label;
          }
          const elementId = getClickElementId(element);
          if (elementId) {
            attributes['emb.click.element_id'] = elementId;
          }

          currentSessionPartSpan.addEvent(
            'click',
            attributes,
            this.perf.offsetToAbsoluteTime(event.timeStamp),
          );
        }
      } catch (e) {
        this._diag.error('failed to create new user interaction span event', e);
      }
    };
  }

  public override onDisable(): void {
    document.removeEventListener('click', this._onClickHandler);
  }

  public override onEnable(): void {
    document.addEventListener('click', this._onClickHandler);
  }
}
