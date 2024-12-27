import {Resource} from '@opentelemetry/resources';
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import {trace} from '@opentelemetry/api';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-http';
import {
  getWebSDKResource,
  SessionSpanProcessor,
} from '@embraceio/embrace-web-sdk';
import {ZoneContextManager} from '@opentelemetry/context-zone';
import {B3Propagator} from '@opentelemetry/propagator-b3';
import {registerInstrumentations} from '@opentelemetry/instrumentation';
import {getWebAutoInstrumentations} from '@opentelemetry/auto-instrumentations-web';

const setupOTelSDK = () => {
  const resource = Resource.default().merge(getWebSDKResource());

  const consoleExporter = new ConsoleSpanExporter();
  const traceExporter = new OTLPTraceExporter({
    url: 'http://localhost:7070/v1/traces',
    headers: {
      'X-EMB-AID': 'ker2B',
      'X-EMB-DID': '018741D8E18447908A72222E7C002DB9',
    },
  });
  const sessionSpanProcessor = new SessionSpanProcessor(traceExporter);
  const consoleSpanProcessor = new SimpleSpanProcessor(consoleExporter);

  const tracerProvider = new WebTracerProvider({
    resource: resource,
    spanProcessors: [sessionSpanProcessor, consoleSpanProcessor],
  });

  tracerProvider.register({
    // todo why do we need these? do the auto instrumentation libraries depend on them?
    contextManager: new ZoneContextManager(),
    propagator: new B3Propagator(),
  });
  registerInstrumentations({
    instrumentations: [getWebAutoInstrumentations()],
  });
  trace.setGlobalTracerProvider(tracerProvider);
};

export {setupOTelSDK};
