import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { emptyResource } from '@opentelemetry/resources';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from '@opentelemetry/sdk-logs';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-web';
import {
  BatchSpanProcessor,
  StackContextManager,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import { createSessionSpanProcessor } from '@opentelemetry/web-common';
import { log } from '../api-logs/index.ts';
import { page } from '../api-page/index.ts';
import { session } from '../api-sessions/index.ts';
import { trace } from '../api-traces/index.ts';
import { user } from '../api-users/index.ts';
import type { AttributeScrubber } from '../common/index.ts';
import {
  EmbraceLogExporter,
  EmbraceTraceExporter,
} from '../exporters/index.ts';
import {
  DEFAULT_LIMITS,
  EmbraceDynamicConfigManager,
  EmbraceLimitManager,
  EmbraceLogManager,
  EmbracePageManager,
  EmbraceSDKFeaturesManager,
  EmbraceSpanSessionManager,
  EmbraceTraceManager,
  EmbraceUserManager,
} from '../managers/index.ts';
import {
  EmbraceLogRecordProcessor,
  EmbraceNetworkSpanProcessor,
  EmbraceSessionBatchedSpanProcessor,
  IdentifiableSessionLogRecordProcessor,
  LogRecordScrubProcessor,
  PageLogRecordProcessor,
  PageSpanProcessor,
  SpanScrubProcessor,
  UserLogRecordProcessor,
  UserSpanProcessor,
} from '../processors/index.ts';
import { EmbraceW3CTraceContextPropagator } from '../propagators/index.ts';
import { getWebSDKResource } from '../resources/index.ts';
import {
  NamespacedStorage,
  nsfConfigValidation,
  OTelPerformanceManager,
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
  SetupSessionArgs,
  SetupTracesArgs,
  SetupUserArgs,
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
    const initSDKStart = perf.getNowMillis();
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

    const useNamespace = !registerGlobally && appID;
    const sdkLocalStorage = useNamespace
      ? new NamespacedStorage(appID, window.localStorage)
      : window.localStorage;
    const sdkSessionStorage = useNamespace
      ? new NamespacedStorage(appID, window.sessionStorage)
      : window.sessionStorage;

    const resourceWithWebSDKAttributes = resource.merge(
      getWebSDKResource({
        diagLogger,
        appVersion: validatedAppVersion,
        pageSessionStorage: sdkSessionStorage,
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

    const spanSessionManager = setupSession({
      limitManager,
      registerGlobally,
      sdkLocalStorage,
      sdkSessionStorage,
    });

    let embraceSpanProcessor: EmbraceSessionBatchedSpanProcessor | undefined;
    let embraceLogProcessor: BatchLogRecordProcessor | undefined;
    if (sendingToEmbrace) {
      embraceSpanProcessor = new EmbraceSessionBatchedSpanProcessor({
        resource: resourceWithWebSDKAttributes,
        exporter: new EmbraceTraceExporter({
          appID: validatedAppID,
          embraceDataURL,
          userID: enduserPseudoID,
        }),
        limitManager,
        storedSpansExpireTimeoutMS:
          defaultInstrumentationConfig?.['session-visibility']
            ?.storedSpansExpireTimeoutMS,
        storage: sdkLocalStorage,
        spanSessionManager,
      });

      embraceLogProcessor = new BatchLogRecordProcessor(
        new EmbraceLogExporter({
          appID: validatedAppID,
          embraceDataURL,
          userID: enduserPseudoID,
        }),
      );
    }

    const pageManager = setupPage({ registerGlobally });

    const { tracerProvider, embraceTraceManager } = setupTraces({
      resource: resourceWithWebSDKAttributes,
      spanSessionManager,
      userManager,
      spanExporters,
      spanProcessors,
      propagator: nsfValid
        ? new EmbraceW3CTraceContextPropagator()
        : propagator,
      contextManager,
      attributeScrubbers: finalAttributeScrubbers,
      registerGlobally,
      embraceSpanProcessor,
      pageManager,
    });

    spanSessionManager.setTracerProvider(tracerProvider);

    const { loggerProvider, embraceLogManager } = setupLogs({
      resource: resourceWithWebSDKAttributes,
      userManager,
      logExporters,
      logProcessors,
      spanSessionManager,
      limitManager,
      attributeScrubbers: finalAttributeScrubbers,
      registerGlobally,
      embraceLogProcessor,
      sdkLocalStorage,
      pageManager,
    });

    // NOTE: we require setupInstrumentation to run the last, after setupLogs and setupTraces. This is how OTel works wrt
    // the dependencies between instrumentations and global providers. We need the providers for tracers, and logs to be
    // setup before we enable instrumentations.
    if (!registerGlobally) {
      registerInstrumentations({
        tracerProvider,
        loggerProvider,
        instrumentations: [
          setupDefaultInstrumentations(defaultInstrumentationConfig, {
            featureManager: sdkFeaturesManager,
            logManager: embraceLogManager,
            spanSessionManager,
            embraceSpanProcessor,
            pageManager,
          }),
          ...instrumentations,
        ],
      });
    } else {
      registerInstrumentations({
        instrumentations: [
          setupDefaultInstrumentations(defaultInstrumentationConfig, {
            featureManager: sdkFeaturesManager,
            embraceSpanProcessor,
            pageManager,
          }),
          ...instrumentations,
        ],
      });
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
      session: spanSessionManager,
      user: userManager,
      page: pageManager,
    };

    if (registerGlobally) {
      registry.register(sdkControl);
    }

    spanSessionManager.recordSDKStartupDuration(
      perf.getNowMillis() - initSDKStart,
    );

    return sdkControl;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error.';
    diagLogger.error(`failed to initialize the SDK: ${message}`);
    return false;
  }
};

const setupUser = ({ registerGlobally, sdkLocalStorage }: SetupUserArgs) => {
  const embraceUserManager = new EmbraceUserManager({
    storage: sdkLocalStorage,
  });

  if (registerGlobally) {
    user.setGlobalUserManager(embraceUserManager);
  }

  return embraceUserManager;
};

const setupSession = ({
  limitManager,
  registerGlobally,
  sdkLocalStorage,
  sdkSessionStorage,
}: SetupSessionArgs) => {
  const embraceSpanSessionManager = new EmbraceSpanSessionManager({
    limitManager,
    storage: sdkLocalStorage,
    sessionStorage: sdkSessionStorage,
  });

  if (registerGlobally) {
    session.setGlobalSessionManager(embraceSpanSessionManager);
  }

  return embraceSpanSessionManager;
};

const setupTraces = ({
  resource,
  spanSessionManager,
  userManager,
  spanExporters,
  spanProcessors = [],
  propagator = null,
  contextManager = null,
  attributeScrubbers,
  registerGlobally,
  embraceSpanProcessor,
  pageManager,
}: SetupTracesArgs) => {
  const finalSpanProcessors: SpanProcessor[] = [
    ...spanProcessors,
    createSessionSpanProcessor(spanSessionManager),
    new EmbraceNetworkSpanProcessor(),
    new UserSpanProcessor({ userManager }),
    new PageSpanProcessor({ pageManager }),
    new SpanScrubProcessor({ attributeScrubbers }),
  ];

  spanExporters?.forEach((exporter) => {
    finalSpanProcessors.push(new BatchSpanProcessor(exporter));
  });

  if (embraceSpanProcessor) {
    finalSpanProcessors.push(embraceSpanProcessor);
  }

  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: finalSpanProcessors,
    spanLimits: {
      // Session properties are stored as attributes on the session span, add a
      // buffer here so that there is room for our internal attributes
      attributeCountLimit: DEFAULT_LIMITS.maxAllowed.session_property * 2,
      attributePerEventCountLimit: 20,
      // Breadcrumbs are stored as events on the session span, add a
      // buffer here so that there is room for our internal events
      eventCountLimit: DEFAULT_LIMITS.maxAllowed.breadcrumb * 2,
      attributeValueLengthLimit: 1024,
    },
  });

  const embraceTraceManager = new EmbraceTraceManager({
    tracerProvider: registerGlobally ? undefined : tracerProvider,
  });

  if (registerGlobally) {
    trace.setGlobalTraceManager(embraceTraceManager);
    tracerProvider.register({
      // WebTracerProvider.register has different fallback behaviours depending on whether null or undefined is passed,
      // be more explicit here and always supply a StackContextManager if the config did not specify one. If a user really
      // wants to turn off context management they can pass a no-op manager explicitly:
      // https://github.com/open-telemetry/opentelemetry-js/blob/4f0b6285af24b71a9fa022755aaa3b6a63ae5033/packages/opentelemetry-sdk-trace-web/src/WebTracerProvider.ts#L39
      contextManager: contextManager || new StackContextManager(),
      propagator,
    });
  }

  return { tracerProvider, embraceTraceManager };
};

const setupLogs = ({
  resource,
  userManager,
  logExporters,
  logProcessors,
  spanSessionManager,
  limitManager,
  attributeScrubbers,
  registerGlobally,
  embraceLogProcessor,
  sdkLocalStorage,
  pageManager,
}: SetupLogsArgs) => {
  const finalLogProcessors: LogRecordProcessor[] = [
    ...logProcessors,
    new IdentifiableSessionLogRecordProcessor({
      spanSessionManager,
    }),
    new EmbraceLogRecordProcessor(),
    new UserLogRecordProcessor({ userManager }),
    new LogRecordScrubProcessor({ attributeScrubbers }),
    new PageLogRecordProcessor({ pageManager }),
  ];

  logExporters?.forEach((exporter) => {
    finalLogProcessors.push(new BatchLogRecordProcessor(exporter));
  });

  if (embraceLogProcessor) {
    finalLogProcessors.push(embraceLogProcessor);
  }

  const loggerProvider = new LoggerProvider({
    resource,
    processors: finalLogProcessors,
  });

  const embraceLogManager = new EmbraceLogManager({
    spanSessionManager,
    limitManager,
    loggerProvider: registerGlobally ? undefined : loggerProvider,
    storage: sdkLocalStorage,
  });

  if (registerGlobally) {
    logs.setGlobalLoggerProvider(loggerProvider);
    log.setGlobalLogManager(embraceLogManager);
  }

  return { loggerProvider, embraceLogManager };
};

const setupPage = ({ registerGlobally }: SetupPageArgs) => {
  const embracePageManager = new EmbracePageManager();

  if (registerGlobally) {
    page.setGlobalPageManager(embracePageManager);
  }

  return embracePageManager;
};
