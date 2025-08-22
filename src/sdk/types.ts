import type {
  ContextManager,
  DiagLogger,
  DiagLogLevel,
  TextMapPropagator,
} from '@opentelemetry/api';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import type { Resource } from '@opentelemetry/resources';
import type {
  LogRecordExporter,
  LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import type { SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-web';
import type { SpanSessionManager } from '../api-sessions/index.js';
import type {
  ClicksInstrumentationArgs,
  GlobalExceptionInstrumentationArgs,
  SpanSessionBrowserActivityInstrumentationArgs,
  SpanSessionOnLoadInstrumentationArgs,
  SpanSessionTimeoutInstrumentationArgs,
  SpanSessionVisibilityInstrumentationArgs,
  WebVitalsInstrumentationArgs,
} from '../instrumentations/index.js';
import type { DocumentLoadInstrumentationConfig } from '@opentelemetry/instrumentation-document-load';
import type { FetchInstrumentationConfig } from '@opentelemetry/instrumentation-fetch';
import type { XMLHttpRequestInstrumentationConfig } from '@opentelemetry/instrumentation-xml-http-request';
import type {
  LimitManagerInternal,
  SpanSessionManagerInternal,
} from '../managers/index.js';
import type { UserManager } from '../api-users/index.js';
import type { AttributeScrubber } from '../common/index.js';
import type { LogManager } from '../api-logs/index.js';
import type { TraceManager } from '../api-traces/index.js';

export interface DynamicSDKConfig {
  /**
   * Pct of users that are sampled. 100% means all users are sampled.
   *
   * **default**: 100
   */
  samplingPct: number;
}

export interface DynamicConfigManager {
  refreshRemoteConfig: () => Promise<void>;
  setConfig: (config: Partial<DynamicSDKConfig>) => void;
  getConfig: () => DynamicSDKConfig;
}

type BaseSDKInitConfig = {
  /**
   * appVersion is used to distinguish between different releases of your application. It can be set here if the value
   * is known in code, otherwise our CLI tool can be used to inject the value at build time.
   *
   * **default**: undefined
   */
  appVersion?: string;

  /**
   * defaultInstrumentationConfig can be used pass options to the default instrumentations by Embrace or turn certain
   * ones off entirely. Note that only some default instrumentations support configuration in this manner.
   *
   * **default**: undefined
   */
  defaultInstrumentationConfig?: DefaultInstrumentationConfig;

  /**
   * instrumentations can be set to include instrumentations beyond the default ones provided by Embrace. This does not
   * override Embrace's default instrumentations, to control those set `defaultInstrumentationConfig` instead.
   *
   * **default**: []
   */
  instrumentations?: Instrumentation[];

  /**
   * propagator defines a custom context propagator that will be attached to the TracerProvider setup by the SDK
   *
   * **default**: null
   */
  propagator?: TextMapPropagator | null;

  /**
   * contextManager defines a custom context manager that will be attached to the TracerProvider setup by the SDK
   *
   * **default**: null
   */
  contextManager?: ContextManager | null;

  /**
   * resource defines a custom Resource that will be merged with the resource defined in `src/resources/webSdkResource.ts`
   * and included with all produced telemetry
   *
   * **default**: Resource.empty()
   */
  resource?: Resource;

  /**
   * spanProcessors
   * Span processor is an interface which allows hooks for span start and end method invocations.
   * They are invoked in the same order as they were registered.
   * Processors created by the sdk are inserted after processors in this list.
   *
   * **default**: []
   */
  spanProcessors?: SpanProcessor[];

  /**
   * logProcessors
   * LogRecordProcessor is an interface which allows hooks for LogRecord emitting.
   * They are invoked in the same order as they were registered.
   * Processors created by the sdk are inserted after processors in this list.
   *
   * **default**: []
   */
  logProcessors?: LogRecordProcessor[];

  /**
   * logLevel controls the verbosity of the SDK console logging
   *
   * **default**: DiagLogLevel.ERROR
   */
  logLevel?: DiagLogLevel;

  /**
   * AttributeScrubber is an interface that allows scrubbing potentially sensitive data before being emitted by the SDK.
   * Each scrubber specifies an attribute key it is concerned with and a function which is supplied with the string from
   * an AttributeValue whenever that key is encountered on a Log or Span. The string returned by the function is then
   * used in place of the original value
   *
   * **default**: []
   */
  attributeScrubbers?: AttributeScrubber[];

  /**
   * enableDefaultAttributeScrubbing specifies whether the default attribute scrubbers provided the SDK should be used.
   * These default scrubbers redact sensitive information in various url.* attributes following the recommendations
   * from: https://github.com/open-telemetry/semantic-conventions/blob/3b64cb31022feaacb410bfd6e571c1f19b5fbce0/docs/registry/attributes/url.md?plain=1#L33
   *
   * **default**: true
   */
  enableDefaultAttributeScrubbing?: boolean;

  /**
   * additionalQueryParamsToScrub specifies a list of query string parameter keys whose values will be scrubbed by the
   * default attribute scrubber. This list is in addition to the default keys that are checked by the SDK one provided
   * by the SDK, see DEFAULT_SENSITIVE_TOKENS in src/sdk/defaultAttributeScrubbers.ts
   *
   * **default**: []
   */
  additionalQueryParamsToScrub?: string[];

  diagLogger?: DiagLogger;

  /**
   * embraceDataURL is used to specify a custom Embrace data URL. This is only used for testing purposes.
   */
  embraceDataURL?: string;

  /**
   * embraceConfigURL is used to specify a custom Embrace configuration URL. This is only used for testing purposes.
   */
  embraceConfigURL?: string;

  /**
   * dynamicSDKConfigManager is used to manage dynamic SDK configuration. The manager can connect to a
   * remote configuration service to fetch the latest configuration. By default, the SDK will use a config manager that
   * fetches configuration from the Embrace dashboard if an appID is provided.
   *
   * **default**: undefined
   */
  dynamicSDKConfigManager?: DynamicConfigManager;

  /**
   * dynamicSDKConfig is an optional object that can be used to configure the SDK. Everything in this configuration
   * can be set dynamically at any time after the SDK has been initialized.
   * If an Embrace appID is provided, the configuration can be set remotely through the Embrace dashboard.
   *
   * **default**: EmbraceDynamicConfigManager
   */
  dynamicSDKConfig?: Partial<DynamicSDKConfig>;

  /**
   * registerGlobally is used to specify whether the SDK should register itself globally. This is useful when
   * the SDK is used in multiple applications on the same page, and you want to avoid telemetry from one application
   * to interfere with another.
   */
  registerGlobally?: boolean;
};

/*
 * Remaining configuration is split between these types to reflect the fact that an Embrace appID is optional ONLY when
 * either custom spanExporters or custom logExporters have been defined
 */
type EmbraceExportSDKInitConfig = {
  /**
   * appID is a unique identifier for your application. It is used to identify your application in Embrace, and can be
   * found in the Embrace dashboard. This can only be omitted if at least one spanExporter or logExporter is setup to
   * send data to a collector other than Embrace.
   *
   * **default**: undefined
   */
  appID: string;

  spanExporters?: SpanExporter[];
  logExporters?: LogRecordExporter[];
};

type LogExportSDKInitConfig = {
  /**
   * logExporters can be set to export logs to a collector other than Embrace. If `appID` is omitted at lease one
   * exporter needs to be set here, or in `spanExporters`.
   *
   * **default**: []
   */
  logExporters: [LogRecordExporter, ...LogRecordExporter[]];

  appID?: string;
  spanExporters?: SpanExporter[];
};

type SpanExportSDKInitConfig = {
  /**
   * spanExporters can be set to export span to a collector other than Embrace. If `appID` is omitted at lease one
   * exporter needs to be set here, or in `logExporters`.
   *
   * **default**: []
   */
  spanExporters: [SpanExporter, ...SpanExporter[]];

  appID?: string;
  logExporters?: LogRecordExporter[];
};

export type SDKInitConfig = BaseSDKInitConfig &
  (
    | EmbraceExportSDKInitConfig
    | LogExportSDKInitConfig
    | SpanExportSDKInitConfig
  );

export interface SDKControl {
  flush: () => Promise<void>;
  setDynamicConfig: (config: Partial<DynamicSDKConfig>) => void;
  log: LogManager;
  trace: TraceManager;
  session: SpanSessionManager;
  user: UserManager;
}

export interface SetupUserArgs {
  registerGlobally?: boolean;
}

export interface SetupSessionArgs {
  limitManager: LimitManagerInternal;
  registerGlobally?: boolean;
}

export interface SetupTracesArgs {
  sendingToEmbrace: boolean;
  appID?: string;
  enduserPseudoID?: string;
  resource: Resource;
  spanSessionManager: SpanSessionManager;
  userManager: UserManager;
  spanExporters?: SpanExporter[];
  spanProcessors: SpanProcessor[];
  propagator?: TextMapPropagator | null;
  contextManager?: ContextManager | null;
  limitManager: LimitManagerInternal;
  attributeScrubbers: AttributeScrubber[];
  embraceDataURL?: string;
  dynamicSDKConfig?: DynamicSDKConfig;
  registerGlobally?: boolean;
}

export interface SetupLogsArgs {
  sendingToEmbrace: boolean;
  appID?: string;
  enduserPseudoID?: string;
  resource: Resource;
  userManager: UserManager;
  logExporters?: LogRecordExporter[];
  logProcessors: LogRecordProcessor[];
  spanSessionManager: SpanSessionManagerInternal;
  limitManager: LimitManagerInternal;
  attributeScrubbers: AttributeScrubber[];
  embraceDataURL?: string;
  registerGlobally?: boolean;
}

type OptionalInstrumentations =
  | 'exception'
  | 'click'
  | 'web-vital'
  | '@opentelemetry/instrumentation-document-load'
  | '@opentelemetry/instrumentation-fetch'
  | '@opentelemetry/instrumentation-xml-http-request';

interface NetworkInstrumentationArgs {
  ignoreUrls?: Array<string | RegExp>;
}

export interface SetupDefaultInstrumentationsArgs {
  logManager?: LogManager;
  spanSessionManager?: SpanSessionManager;
}

export interface DefaultInstrumentationConfig {
  omit?: Set<OptionalInstrumentations>;
  exception?: GlobalExceptionInstrumentationArgs;
  click?: ClicksInstrumentationArgs;
  'web-vital'?: WebVitalsInstrumentationArgs;
  'session-on-load'?: SpanSessionOnLoadInstrumentationArgs;
  'session-visibility'?: SpanSessionVisibilityInstrumentationArgs;
  'session-activity'?: SpanSessionBrowserActivityInstrumentationArgs;
  'session-timeout'?: SpanSessionTimeoutInstrumentationArgs;

  // Convenience to allow common config arguments for '@opentelemetry/instrumentation-fetch' and
  // '@opentelemetry/instrumentation-xml-http-request' to just be specified once
  network?: NetworkInstrumentationArgs;

  /*
    Remove 'enabled' from the accepted config for the @opentelemetry instrumentations. This parameter is misleading
    since we are going to call `registerInstrumentations` for every instrumentation we include here even if their
    config has enabled=false. Instead, use `omit` to specify which default instrumentations should be turned off.
   */
  '@opentelemetry/instrumentation-document-load'?: Omit<
    DocumentLoadInstrumentationConfig,
    'enabled'
  >;
  '@opentelemetry/instrumentation-fetch'?: Omit<
    FetchInstrumentationConfig,
    'enabled'
  >;
  '@opentelemetry/instrumentation-xml-http-request'?: Omit<
    XMLHttpRequestInstrumentationConfig,
    'enabled'
  >;
}

export interface SDKRegistryManager {
  register: (sdk: SDKControl) => void;
  clear: () => void;
  registered: () => SDKControl | null;
}
