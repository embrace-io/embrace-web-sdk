import type { Attributes } from '@opentelemetry/api';
import type { PageManager } from '../../../api-page/index.ts';
import type { EmbraceInstrumentationBaseArgs } from '../../EmbraceInstrumentationBase/index.ts';
import type { PageLoadType } from './constants.ts';

export interface PageLoad {
  /** `initial_load` for the hard navigation, `route_change` for each later route. */
  type: PageLoadType;
  /** Milliseconds from the start of the page view until it finished loading. */
  duration: number;
}

export type PageLoadInstrumentationArgs = Pick<
  EmbraceInstrumentationBaseArgs,
  'diag' | 'perf'
> & {
  /**
   * Returns attributes to add to each `page-load` log. A returned key that
   * collides with one this instrumentation sets is dropped.
   */
  applyCustomAttributesOnLog?: (pageLoad: PageLoad) => Attributes;

  /**
   * Requests left out when deciding whether the page is still loading, such as
   * long-polling or streaming requests that never finish. A string is resolved
   * against the page URL and matches the full request URL exactly, a RegExp
   * matches anywhere in it.
   *
   * As a default instrumentation of `initSDK`, it also leaves out the requests
   * the SDK sends to Embrace. Requests made by exporters passed to `initSDK`
   * are not left out: list their URLs here.
   *
   * *default*: []
   */
  ignoreUrls?: Array<string | RegExp>;

  /** @internal SDK use only */
  pageManager?: PageManager;
};
