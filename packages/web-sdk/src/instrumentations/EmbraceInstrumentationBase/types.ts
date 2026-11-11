import type { InstrumentationDeps } from '#opentelemetry/browser-api';
import type { LogManager } from '../../api-logs/index.ts';
import type { PageManager } from '../../api-page/index.ts';
import type {
  LimitManagerInternal,
  UserSessionManagerInternal,
} from '../../managers/index.ts';
import type { PerformanceManager } from '../../utils/index.ts';

export interface EmbraceInstrumentationBaseArgs<
  ConfigType extends object = object,
> {
  instrumentationName: string;
  instrumentationVersion: string;
  config: ConfigType;
}

/**
 * The Embrace managers that initSDK passes to `enable()`, so an instance gets
 * the SDK's own managers under `registerGlobally: false` too. The first
 * `enable()` locks them. A missing user session, log or page manager falls back
 * to the global one; a missing `limitManager` means no limits.
 */
export interface EmbraceInstrumentationDeps extends InstrumentationDeps {
  readonly userSessionManager?: UserSessionManagerInternal;
  readonly logManager?: LogManager;
  readonly limitManager?: LimitManagerInternal;
  readonly perf?: PerformanceManager;
  readonly pageManager?: PageManager;
}
