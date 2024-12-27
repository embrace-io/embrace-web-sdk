import {trace} from '@opentelemetry/api';
import {v4 as uuid} from 'uuid';

const tracer = trace.getTracer('embrace-web-sdk-sessions');

const startSessionSpan = () => {
  const sessionSpan = tracer.startSpan('emb-session');
  sessionSpan.setAttributes({
    'emb.type': 'ux.session',
    'session.id': uuid().replace(/-/g, '').toUpperCase(),
  });

  return sessionSpan;
};

export {startSessionSpan};
