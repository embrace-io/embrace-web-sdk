import type {
  ContextManager,
  TextMapPropagator,
  DiagLogger,
} from '@opentelemetry/api';
import type { Instrumentation } from '@opentelemetry/instrumentation';
import type { Resource } from '@opentelemetry/resources';
import type {
  LogRecordExporter,
  LogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-web';
import type { SpanSessionManager } from '../api-sessions/index.js';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
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

export type SDKLogLevel = 'info' | 'warning' | 'error';

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
  defaultInstrumentationConfig?: DefaultInstrumenationConfig;

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
   * **default**: 'error'
   */
  logLevel?: SDKLogLevel;

  diagLogger?: DiagLogger;
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
  logExporters: LogRecordExporter[];

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
  spanExporters: SpanExporter[];

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
}

export interface SetupTracesArgs {
  sendingToEmbrace: boolean;
  appID?: string;
  enduserPseudoID?: string;
  resource: Resource;
  spanSessionManager: SpanSessionManager;
  spanExporters?: SpanExporter[];
  spanProcessors: SpanProcessor[];
  propagator?: TextMapPropagator | null;
  contextManager?: ContextManager | null;
}

export interface SetupLogsArgs {
  sendingToEmbrace: boolean;
  appID?: string;
  enduserPseudoID?: string;
  resource: Resource;
  logExporters?: LogRecordExporter[];
  logProcessors: LogRecordProcessor[];
  spanSessionManager: SpanSessionManager;
}

type OptionalInstrumentations =
  | 'exception'
  | 'click'
  | 'web-vital'
  | '@opentelemetry/instrumentation-document-load'
  | '@opentelemetry/instrumentation-fetch'
  | '@opentelemetry/instrumentation-xml-http-request';

export interface DefaultInstrumenationConfig {
  omit?: Set<OptionalInstrumentations>;
  exception?: GlobalExceptionInstrumentationArgs;
  click?: ClicksInstrumentationArgs;
  'web-vital'?: WebVitalsInstrumentationArgs;
  'session-on-load'?: SpanSessionOnLoadInstrumentationArgs;
  'session-visibility'?: SpanSessionVisibilityInstrumentationArgs;
  'session-activity'?: SpanSessionBrowserActivityInstrumentationArgs;
  'session-timeout'?: SpanSessionTimeoutInstrumentationArgs;
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
