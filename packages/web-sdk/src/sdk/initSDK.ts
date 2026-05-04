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
import { log } from '../api-logs/index.ts';
import { page } from '../api-page/index.ts';
import type { UserSessionManager } from '../api-sessions/index.ts';
import { session } from '../api-sessions/index.ts';
import { ProxyUserSessionManager } from '../api-sessions/manager/ProxyUserSessionManager/index.ts';
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
  EmbraceTraceManager,
  EmbraceUserManager,
  EmbraceUserSessionManager,
} from '../managers/index.ts';
import {
  BrowserLogRecordProcessor,
  BrowserSpanProcessor,
  EmbraceLogRecordProcessor,
  EmbraceNetworkSpanProcessor,
  EmbraceSessionBatchedSpanProcessor,
  IdentifiableSessionLogRecordProcessor,
  IdentifiableSessionPartSpanProcessor,
  LogRecordScrubProcessor,
  PageLogRecordProcessor,
  PageSpanProcessor,
  SpanScrubProcessor,
  UserLogRecordProcessor,
  UserSessionLogRecordProcessor,
  UserSessionSpanProcessor,
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
  SafeStorage,
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
    useDocumentTitleAsPageLabel = true,
    userSessionConfig,
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
    const storageDiag = diag.createComponentLogger({
      namespace: 'embrace-storage',
    });
    const sdkLocalStorage = new SafeStorage(
      useNamespace
        ? new NamespacedStorage(appID, window.localStorage)
        : window.localStorage,
      storageDiag,
    );
    const sdkSessionStorage = new SafeStorage(
      useNamespace
        ? new NamespacedStorage(appID, window.sessionStorage)
        : window.sessionStorage,
      storageDiag,
    );

    const resourceWithWebSDKAttributes = getWebSDKOverridableResource()
      .merge(resource)
      .merge(
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

    const userSessionManager = setupSession({
      limitManager,
      registerGlobally,
      sdkLocalStorage,
      userSessionConfig,
    });

    let embraceSpanProcessor: EmbraceSessionBatchedSpanProcessor | undefined;
    let embraceLogProcessor: BatchLogRecordProcessor | undefined;
    if (sendingToEmbrace) {
      embraceSpanProcessor = new EmbraceSessionBatchedSpanProcessor({
        exporter: new EmbraceTraceExporter({
          appID: validatedAppID,
          embraceDataURL,
          userID: enduserPseudoID,
        }),
        limitManager,
        userSessionManager,
      });

      embraceLogProcessor = new BatchLogRecordProcessor(
        new EmbraceLogExporter({
          appID: validatedAppID,
          embraceDataURL,
          userID: enduserPseudoID,
        }),
      );
    }

    const pageManager = setupPage({
      useDocumentTitleAsPageLabel,
      registerGlobally,
    });

    const { tracerProvider, embraceTraceManager } = setupTraces({
      resource: resourceWithWebSDKAttributes,
      userManager,
      userSessionManager,
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

    userSessionManager.setTracerProvider(tracerProvider);
    userSessionManager.startSessionPart('init');

    const { loggerProvider, embraceLogManager } = setupLogs({
      resource: resourceWithWebSDKAttributes,
      userManager,
      userSessionManager,
      logExporters,
      logProcessors,
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
            logManager: embraceLogManager,
            userSessionManager,
            pageManager,
            limitManager,
          }),
          ...instrumentations,
        ],
      });
    } else {
      registerInstrumentations({
        instrumentations: [
          setupDefaultInstrumentations(defaultInstrumentationConfig, {
            pageManager,
            limitManager,
          }),
          ...instrumentations,
        ],
      });
    }

    diagLogger.info('successfully initialized the SDK');

    // SDKControl.session is always a ProxyUserSessionManager so deprecated
    // forwarders are exposed alongside the live methods. When
    // registerGlobally is true the global `session` singleton is reused.
    const sdkUserSessionAPI: UserSessionManager = (() => {
      if (registerGlobally) {
        return session;
      }
      const proxyManager = new ProxyUserSessionManager();
      proxyManager.setUserSessionManager(userSessionManager);
      return proxyManager;
    })();

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
      session: sdkUserSessionAPI,
      user: userManager,
      page: pageManager,
    };

    if (registerGlobally) {
      registry.register(sdkControl);
    }

    userSessionManager.recordSDKStartupDuration(
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
  userSessionConfig,
}: SetupSessionArgs) => {
  const userSessionManager = new EmbraceUserSessionManager({
    limitManager,
    storage: sdkLocalStorage,
    config: userSessionConfig,
  });

  if (registerGlobally) {
    session.setGlobalUserSessionManager(userSessionManager);
  }

  return userSessionManager;
};

const setupTraces = ({
  resource,
  userManager,
  userSessionManager,
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
    new IdentifiableSessionPartSpanProcessor({ userSessionManager }),
    new UserSessionSpanProcessor({ userSessionManager }),
    new BrowserSpanProcessor(),
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
      // Session properties are stored as attributes on the session part span,
      // add a buffer here so that there is room for our internal attributes
      attributeCountLimit: DEFAULT_LIMITS.maxAllowed.session_property * 2,
      // Breadcrumbs are stored as events on the session part span, add a
      // buffer here so that there is room for our internal events
      eventCountLimit: DEFAULT_LIMITS.maxAllowed.breadcrumb * 2,
    },
  });

  const embraceTraceManager = new EmbraceTraceManager({
    tracerProvider: registerGlobally ? undefined : tracerProvider,
    userSessionManager,
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
  userSessionManager,
  logExporters,
  logProcessors,
  limitManager,
  attributeScrubbers,
  registerGlobally,
  embraceLogProcessor,
  sdkLocalStorage,
  pageManager,
}: SetupLogsArgs) => {
  const finalLogProcessors: LogRecordProcessor[] = [
    ...logProcessors,
    new IdentifiableSessionLogRecordProcessor({ userSessionManager }),
    new UserSessionLogRecordProcessor({ userSessionManager }),
    new BrowserLogRecordProcessor(),
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
    userSessionManager,
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

const setupPage = ({
  useDocumentTitleAsPageLabel,
  registerGlobally,
}: SetupPageArgs) => {
  const embracePageManager = new EmbracePageManager({
    useDocumentTitleAsPageLabel,
  });

  if (registerGlobally) {
    page.setGlobalPageManager(embracePageManager);
  }

  return embracePageManager;
};
