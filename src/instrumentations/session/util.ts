import {ReadableSpan} from '@opentelemetry/sdk-trace-web';
import {EMB_SESSION, EMB_TYPE} from './constants';

const isSessionSpan = (span: ReadableSpan) => {
  return span.attributes[EMB_TYPE] === EMB_SESSION;
};

export {isSessionSpan};
