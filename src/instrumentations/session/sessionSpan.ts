import {trace} from '@opentelemetry/api';

const tracer = trace.getTracer('embrace-web-sdk-sessions');

const startSessionSpan = () => {
  const sessionSpan = tracer.startSpan('emb-session');
  sessionSpan.setAttributes({
    'emb.type': 'ux.session',
  });

  return sessionSpan;
};

export {startSessionSpan};
