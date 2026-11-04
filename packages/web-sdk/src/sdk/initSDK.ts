import {
  context,
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  logs,
  propagation,
  trace,
} from '@opentelemetry/api';
import type { Instrumentation as LegacyOTelInstrumentation } from '@opentelemetry/instrumentation';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { emptyResource } from '@opentelemetry/resources';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { SpanProcessor } from '@opentelemetry/sdk-trace';
import {
  BatchSpanProcessor,
  StackContextManager,
} from '@opentelemetry/sdk-trace';
import type {
  Instrumentation,
  InstrumentationDeps,
} from '#opentelemetry/browser-instrumentation-api';
import { log } from '../api-logs/index.ts';
import { page } from '../api-page/index.ts';
import { session } from '../api-sessions/index.ts';
import { trace as embraceTrace } from '../api-traces/index.ts';
import { user } from '../api-users/index.ts';
import type { AttributeScrubber } from '../common/index.ts';
import {
  EmbraceLogExporter,
  EmbraceTraceExporter,
  getLogEndpoint,
  getTraceEndpoint,
} from '../exporters/index.ts';
import {
  DEFAULT_LIMITS,
  DEFAULT_MAX_SPAN_EVENT_ATTRIBUTES,
  EmbraceDynamicConfigManager,
  EmbraceLimitManager,
  EmbraceLoggerProvider,
  EmbraceLogManager,
  EmbracePageManager,
  EmbraceSDKFeaturesManager,
  EmbraceTraceManager,
  EmbraceTracerProvider,
  EmbraceUserManager,
  EmbraceUserSessionManager,
} from '../managers/index.ts';
import {
  BrowserLogRecordProcessor,
  BrowserSpanProcessor,
  EmbraceLogRecordProcessor,
  EmbraceNetworkSpanProcessor,
  EmbraceSessionPartBatchedSpanProcessor,
  LogRecordScrubProcessor,
  PageLogRecordProcessor,
  PageSpanProcessor,
  PerfClockLagLogRecordProcessor,
  PerfClockLagSpanProcessor,
  SignalBuffer,
  SignalCorrelationLogRecordProcessor,
  SignalCorrelationSpanProcessor,
  SpanScrubProcessor,
  UserLogRecordProcessor,
  UserSessionLogRecordProcessor,
  UserSpanProcessor,
} from '../processors/index.ts';
import { EmbraceW3CTraceContextPropagator } from '../propagators/index.ts';
import {
  getWebSDKOverridableResource,
  getWebSDKResource,
} from '../resources/index.ts';
import {
  NamespacedStorage,
  nsfConfigValidation,
  OTelPerformanceManager,
  SDK_LOAD_ORIGIN_OFFSET,
} from '../utils/index.ts';
import { getDefaultAttributeScrubbers } from './defaultAttributeScrubbers.ts';
import { registry } from './registry.ts';
import { setupDefaultInstrumentations } from './setupDefaultInstrumentations.ts';
import type {
  DynamicSDKConfig,
  SDKControl,
  SDKInitConfig,
  SetupLogsArgs,
  SetupPageArgs,
  SetupTracesArgs,
  SetupUserArgs,
  SetupUserSessionArgs,
} from './types.ts';
import { validateAppID, validateAppVersion } from './utils.ts';

export const initSDK = (
  {
    appID,
    appVersion,
    resource = emptyResource(),
    spanExporters = [],
    logExporters = [],
    spanProcessors = [],
    propagator = null,
    defaultInstrumentationConfig,
    instrumentations = [],
    contextManager = null,
    logProcessors = [],
    attributeScrubbers = [],
    enableDefaultAttributeScrubbing = true,
    additionalQueryParamsToScrub = [],
    logLevel = DiagLogLevel.ERROR,
    embraceDataURL,
    embraceConfigURL,
    diagLogger = diag.createComponentLogger({
      namespace: 'embrace-sdk',
    }),
    dynamicSDKConfigManager: providedDynamicSDKConfigManager,
    dynamicSDKConfig,
    registerGlobally = true,
    blockNetworkSpanForwarding = false,
    restrictedProtocols = new Set(['file:']),
    useDocumentTitleAsPageLabel = true,
  }: SDKInitConfig = {} as SDKInitConfig,
): SDKControl | false => {
  try {
    if (registerGlobally) {
      const existingSDK = registry.registered();
      if (existingSDK !== null) {
        diagLogger.warn(
          'SDK has already been successfully initialized, skipping this invocation of initSDK',
        );
        return existingSDK;
      }
    }

    diag.setLogger(new DiagConsoleLogger(), {
      logLevel,
    });

    if (typeof window === 'undefined') {
      diagLogger.warn('browser not detected, skipping initialization');
      return false;
    }

    const perf = new OTelPerformanceManager();
    const initOriginOffset = perf.getOffsetFromOrigin();

    window.addEventListener('pageshow', (event) =>
      perf.setZeroTimeOffset(event.timeStamp),
    );
    // A sleep is noticed on the first clock read after it, and the origin
    // boundary is set to the read before that, so only a read just before the
    // sleep matters: blur came before every sleep in testing, and
    // visibilitychange covers a page that was already hidden.
    window.addEventListener('blur', perf.checkDrift);
    window.document.addEventListener('visibilitychange', perf.checkDrift);

    const validatedAppID = validateAppID(appID);
    const validatedAppVersion = validateAppVersion(appVersion);

    const sendingToEmbrace = validatedAppID !== undefined;

    if (!sendingToEmbrace && !logExporters.length && !spanExporters.length) {
      throw new Error(
        'when appID is omitted, at least one logExporter or spanExporter must be set',
      );
    }

    if (restrictedProtocols.has(window.location.protocol)) {
      throw new Error(
        `not initializing due to restricted protocol: ${window.location.protocol}`,
      );
    }

    if (sendingToEmbrace && typeof CompressionStream === 'undefined') {
      throw new Error(
        'CompressionStream is not supported in this browser and required for data compression.',
      );
    }

    const namespace = appID ?? undefined;
    const sdkLocalStorage = new NamespacedStorage({
      namespace,
      storage: window.localStorage,
      diag: diagLogger,
    });
    const sdkTabStorage = new NamespacedStorage({
      namespace,
      storage: window.sessionStorage,
      diag: diagLogger,
    });

    const resourceWithWebSDKAttributes = getWebSDKOverridableResource()
      .merge(resource)
      .merge(
        getWebSDKResource({
          diagLogger,
          appVersion: validatedAppVersion,
          tabStorage: sdkTabStorage,
        }),
      );

    const userManager = setupUser({ registerGlobally, sdkLocalStorage });
    const enduserPseudoID = userManager.getEmbraceUserId();
    if (sendingToEmbrace && !enduserPseudoID) {
      throw new Error('userID is required when using Embrace exporter');
    }

    const dynamicConfigManager =
      providedDynamicSDKConfigManager ??
      new EmbraceDynamicConfigManager({
        appID: validatedAppID,
        appVersion: validatedAppVersion,
        embraceConfigURL,
        defaultConfig: dynamicSDKConfig,
        deviceId: enduserPseudoID,
        storage: sdkLocalStorage,
      });
    void dynamicConfigManager.refreshRemoteConfig();

    const sdkFeaturesManager = new EmbraceSDKFeaturesManager({
      dynamicConfigManager,
      deviceId: enduserPseudoID,
      blockNetworkSpanForwarding,
    });

    if (!sdkFeaturesManager.isSDKEnabled()) {
      diagLogger.debug('SDK is disabled, skipping initialization.');

      return false;
    }

    const nsfValid = nsfConfigValidation({
      featureManager: sdkFeaturesManager,
      diag: diagLogger,
      registerGlobally,
      defaultInstrumentationConfig,
      propagator,
    });

    const limitManager = new EmbraceLimitManager(DEFAULT_LIMITS);

    const finalAttributeScrubbers: AttributeScrubber[] = [
      ...(enableDefaultAttributeScrubbing
        ? getDefaultAttributeScrubbers(additionalQueryParamsToScrub)
        : []),
      ...attributeScrubbers,
    ];

    const userSessionManager = setupUserSession({
      limitManager,
      perf,
      registerGlobally,
      sdkLocalStorage,
      visibilityDoc: window.document,
      dynamicConfigManager,
    });

    let embraceSpanProcessor:
      | EmbraceSessionPartBatchedSpanProcessor
      | undefined;
    let embraceLogProcessor: BatchLogRecordProcessor | undefined;
    const embraceExporterEndpoints: string[] = [];
    if (sendingToEmbrace) {
      embraceExporterEndpoints.push(
        getTraceEndpoint(validatedAppID, embraceDataURL),
        getLogEndpoint(validatedAppID, embraceDataURL),
      );
      embraceSpanProcessor = new EmbraceSessionPartBatchedSpanProcessor({
        exporter: new EmbraceTraceExporter({
          appID: validatedAppID,
          embraceDataURL,
          userID: enduserPseudoID,
        }),
        limitManager,
        userSessionManager,
      });

      embraceLogProcessor = new BatchLogRecordProcessor({
        exporter: new EmbraceLogExporter({
          appID: validatedAppID,
          embraceDataURL,
          userID: enduserPseudoID,
        }),
      });
    }

    const pageManager = setupPage({
      useDocumentTitleAsPageLabel,
      registerGlobally,
      userSessionManager,
      perf,
    });

    // The correlation buffer is only needed to back-fill soft-navigation
    // spans, so skip creating it when that instrumentation is omitted.
    const softNavigationEnabled = !defaultInstrumentationConfig?.omit?.has(
      'soft-navigation-performance',
    );
    const signalBuffer = softNavigationEnabled ? new SignalBuffer() : undefined;
    const tracePropagator = nsfValid
      ? new EmbraceW3CTraceContextPropagator()
      : propagator;

    const { tracerProvider, embraceTraceManager } = setupTraces({
      resource: resourceWithWebSDKAttributes,
      userManager,
      spanExporters,
      spanProcessors,
      propagator: tracePropagator,
      contextManager,
      attributeScrubbers: finalAttributeScrubbers,
      registerGlobally,
      embraceSpanProcessor,
      embraceExporterEndpoints,
      pageManager,
      perf,
      signalBuffer,
      diagLogger,
    });

    userSessionManager.setTracerProvider(tracerProvider);
    // No-op if the tab is hidden/unfocused at init; the first part starts
    // on the next engagement via the manager's browser-activity listeners.
    userSessionManager.startSessionPartInternal({ reason: 'init' });

    const { loggerProvider, embraceLogManager } = setupLogs({
      resource: resourceWithWebSDKAttributes,
      userManager,
      logExporters,
      logProcessors,
      userSessionManager,
      limitManager,
      attributeScrubbers: finalAttributeScrubbers,
      perf,
      registerGlobally,
      embraceLogProcessor,
      sdkLocalStorage,
      pageManager,
      visibilityDoc: window.document,
      signalBuffer,
      diagLogger,
    });

    // Enabled last: enable(deps) and registerInstrumentations need the providers set up above.
    const instrumentationDeps: InstrumentationDeps = {
      tracerProvider,
      loggerProvider,
      propagator: tracePropagator ?? undefined,
    };
    const defaultInstrumentations = setupDefaultInstrumentations(
      defaultInstrumentationConfig,
      registerGlobally
        ? { pageManager, limitManager, signalBuffer }
        : {
            logManager: embraceLogManager,
            userSessionManager,
            pageManager,
            limitManager,
            signalBuffer,
          },
    );
    // The option type rejects OTel JS instrumentations, but JavaScript callers can still pass one.
    const userInstrumentations = instrumentations.filter((instrumentation) => {
      if (!isLegacyOTelInstrumentation(instrumentation)) {
        return true;
      }
      diagLogger.error(
        `skipped ${instrumentation.instrumentationName}: only OpenTelemetry Browser instrumentations are supported`,
      );
      return false;
    });
    // Per item so both kinds still enable in array order, and a throwing enable()
    // neither stops the rest nor fails initSDK after the globals are set.
    for (const instrumentation of [
      ...defaultInstrumentations,
      ...userInstrumentations,
    ]) {
      try {
        if (isLegacyOTelInstrumentation(instrumentation)) {
          registerInstrumentations({
            tracerProvider,
            loggerProvider,
            instrumentations: [instrumentation],
          });
        } else {
          instrumentation.enable(instrumentationDeps);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error.';
        diagLogger.error(
          `failed to enable ${instrumentation.instrumentationName}: ${message}`,
        );
      }
    }

    diagLogger.info('successfully initialized the SDK');

    const sdkControl: SDKControl = {
      setDynamicConfig: (config: Partial<DynamicSDKConfig>) => {
        dynamicConfigManager.setConfig(config);
      },
      flush: async () => {
        await tracerProvider.forceFlush();
        await loggerProvider.forceFlush();
      },
      log: embraceLogManager,
      trace: embraceTraceManager,
      session: userSessionManager,
      user: userManager,
      page: pageManager,
    };

    if (registerGlobally) {
      registry.register(sdkControl);
    }

    userSessionManager.recordSDKStartupTimings({
      initDuration: perf.getOffsetFromOrigin() - initOriginOffset,
      loadOriginOffset: SDK_LOAD_ORIGIN_OFFSET,
      initOriginOffset,
    });

    return sdkControl;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error.';
    diagLogger.error(`failed to initialize the SDK: ${message}`);
    return false;
  }
};

// The default fetch and XHR instrumentations are OTel JS ones, which take providers through
// setters, so registerInstrumentations drives them.
const isLegacyOTelInstrumentation = (
  instrumentation: Instrumentation | LegacyOTelInstrumentation,
): instrumentation is LegacyOTelInstrumentation =>
  'setTracerProvider' in instrumentation;

const setupUser = ({ registerGlobally, sdkLocalStorage }: SetupUserArgs) => {
  const embraceUserManager = new EmbraceUserManager({
    storage: sdkLocalStorage,
  });

  if (registerGlobally) {
    user.setGlobalUserManager(embraceUserManager);
  }

  return embraceUserManager;
};

const setupUserSession = ({
  limitManager,
  perf,
  registerGlobally,
  sdkLocalStorage,
  visibilityDoc,
  dynamicConfigManager,
}: SetupUserSessionArgs) => {
  const embraceUserSessionManager = new EmbraceUserSessionManager({
    limitManager,
    perf,
    storage: sdkLocalStorage,
    visibilityDoc,
    dynamicConfigManager,
  });

  if (registerGlobally) {
    session.setGlobalUserSessionManager(embraceUserSessionManager);
  }

  return embraceUserSessionManager;
};

const setupTraces = ({
  resource,
  userManager,
  spanExporters,
  spanProcessors = [],
  propagator = null,
  contextManager = null,
  attributeScrubbers,
  registerGlobally,
  embraceSpanProcessor,
  embraceExporterEndpoints,
  pageManager,
  perf,
  signalBuffer,
  diagLogger,
}: SetupTracesArgs) => {
  const finalSpanProcessors: SpanProcessor[] = [
    ...spanProcessors,
    new BrowserSpanProcessor(),
    new EmbraceNetworkSpanProcessor({ embraceExporterEndpoints }),
    new UserSpanProcessor({ userManager }),
    new PageSpanProcessor({ pageManager }),
    new PerfClockLagSpanProcessor({ perf }),
    new SpanScrubProcessor({ attributeScrubbers }),
    // Placement in this chain does not affect the stamp: every
    // processor's onEnding runs before any onEnd (the batcher exports at
    // onEnd), so the soft-navigation span still sees the full window.
    ...(signalBuffer
      ? [
          new SignalCorrelationSpanProcessor({
            buffer: signalBuffer,
          }),
        ]
      : []),
  ];

  spanExporters?.forEach((exporter) => {
    finalSpanProcessors.push(new BatchSpanProcessor({ exporter }));
  });

  if (embraceSpanProcessor) {
    finalSpanProcessors.push(embraceSpanProcessor);
  }

  // The trace manager, the user session manager, the instrumentations and, when registered
  // globally, the OTel trace API all get their tracers here, so all of them keep span times on the
  // wall clock across a sleep.
  const tracerProvider = new EmbraceTracerProvider({
    perf,
    resource,
    spanProcessors: finalSpanProcessors,
    spanLimits: {
      // Session properties are stored as attributes on the session part span,
      // add a buffer here so that there is room for our internal attributes
      attributeCountLimit: DEFAULT_LIMITS.maxAllowed.session_property * 2,
      // Breadcrumbs are stored as events on the session part span, add a
      // buffer here so that there is room for our internal events
      eventCountLimit: DEFAULT_LIMITS.maxAllowed.breadcrumb * 2,
      attributePerEventCountLimit: DEFAULT_MAX_SPAN_EVENT_ATTRIBUTES,
    },
  });

  const embraceTraceManager = new EmbraceTraceManager({
    tracerProvider: registerGlobally ? undefined : tracerProvider,
  });

  if (registerGlobally) {
    embraceTrace.setGlobalTraceManager(embraceTraceManager);
    // Fails for the same reasons as setGlobalLoggerProvider in setupLogs
    if (!trace.setGlobalTracerProvider(tracerProvider)) {
      diagLogger.warn(
        'failed to register the global TracerProvider, so trace.getTracer() will not reach the SDK',
      );
    }
    // Unset leaves the no-op propagator: no traceparent inject or extract
    if (propagator) {
      propagation.setGlobalPropagator(propagator);
    }
    // null and undefined both default to StackContextManager; pass a no-op manager to disable context
    const activeContextManager = contextManager || new StackContextManager();
    activeContextManager.enable();
    context.setGlobalContextManager(activeContextManager);
  }

  return { tracerProvider, embraceTraceManager };
};

const setupLogs = ({
  resource,
  userManager,
  logExporters,
  logProcessors,
  userSessionManager,
  limitManager,
  attributeScrubbers,
  perf,
  registerGlobally,
  embraceLogProcessor,
  sdkLocalStorage,
  pageManager,
  visibilityDoc,
  signalBuffer,
  diagLogger,
}: SetupLogsArgs) => {
  const finalLogProcessors: LogRecordProcessor[] = [
    ...logProcessors,
    new UserSessionLogRecordProcessor({
      userSessionManager,
    }),
    new BrowserLogRecordProcessor(),
    new EmbraceLogRecordProcessor(),
    new UserLogRecordProcessor({ userManager }),
    new LogRecordScrubProcessor({ attributeScrubbers }),
    new PageLogRecordProcessor({ pageManager }),
    new PerfClockLagLogRecordProcessor({ perf }),
    // Must run after UserSessionLogRecordProcessor, which stamps the
    // synthetic log id this processor records into the shared buffer.
    // Keeping it last to prevent any ordering issues.
    ...(signalBuffer
      ? [
          new SignalCorrelationLogRecordProcessor({
            buffer: signalBuffer,
          }),
        ]
      : []),
  ];

  logExporters?.forEach((exporter) => {
    finalLogProcessors.push(new BatchLogRecordProcessor({ exporter }));
  });

  if (embraceLogProcessor) {
    finalLogProcessors.push(embraceLogProcessor);
  }

  // The log manager, the instrumentations and, when registered globally, the OTel logs API
  // all get their loggers here, so all of them stamp logs on the SDK clock.
  const loggerProvider = new EmbraceLoggerProvider({
    resource,
    processors: finalLogProcessors,
    perf,
  });

  const embraceLogManager = new EmbraceLogManager({
    userSessionManager,
    limitManager,
    loggerProvider: registerGlobally ? undefined : loggerProvider,
    storage: sdkLocalStorage,
    visibilityDoc,
  });

  if (registerGlobally) {
    // Fails when a LoggerProvider is already registered, or when the page's OTel global
    // belongs to another API version (such as api 1.9 from OTel JS 2.x).
    if (!logs.setGlobalLoggerProvider(loggerProvider)) {
      diagLogger.warn(
        'failed to register the global LoggerProvider, so logs.getLogger() will not reach the SDK',
      );
    }
    log.setGlobalLogManager(embraceLogManager);
  }

  return { loggerProvider, embraceLogManager };
};

const setupPage = ({
  useDocumentTitleAsPageLabel,
  registerGlobally,
  userSessionManager,
  perf,
}: SetupPageArgs) => {
  const embracePageManager = new EmbracePageManager({
    useDocumentTitleAsPageLabel,
    userSessionManager,
    perf,
  });

  if (registerGlobally) {
    page.setGlobalPageManager(embracePageManager);
  }

  return embracePageManager;
};
