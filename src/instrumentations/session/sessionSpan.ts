import {trace} from '@opentelemetry/api';
import generateUUID from '../../utils/generateUUID';
import {EMB_SESSION, EMB_TYPE} from '../../constants/attributes';

const tracer = trace.getTracer('embrace-web-sdk-sessions');

const startSessionSpan = () => {
  const sessionSpan = tracer.startSpan('emb-session');
  sessionSpan.setAttributes({
    [EMB_TYPE]: 'ux.session',
    [EMB_SESSION]: generateUUID(),
  });

  return sessionSpan;
};

export {startSessionSpan};
