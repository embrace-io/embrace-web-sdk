import styles from './App.module.css';

import {Span, trace} from '@opentelemetry/api';
import {useState} from 'react';
import {loggerProvider, sessionProvider} from './otel';
import {SeverityNumber} from '@opentelemetry/api-logs';

const tracer = trace.getTracer('embrace-web-sdk-demo');
const logger = loggerProvider.getLogger('default');

const App = () => {
  const [spans, setSpans] = useState<Span[]>([]);

  const [isSessionSpanStarted, setIsSessionSpanStarted] = useState(false);

  const handleStartSessionSpan = () => {
    sessionProvider.startSessionSpan();
    setIsSessionSpanStarted(true);
  };

  const handleEndSessionSpan = () => {
    if (sessionProvider.getSessionSpan()) {
      sessionProvider.endSessionSpan();
      setIsSessionSpanStarted(false);
    }
  };

  const handleStartSpan = () => {
    const span = tracer.startSpan('demo-span');
    setSpans([...spans, span]);
  };

  const handleEndSpan = (span: Span, index: number) => {
    span.end();

    const newSpans = [...spans];
    newSpans.splice(index, 1);

    setSpans(newSpans);
  };

  const handleRecordException = () => {
    const errorSpan = tracer.startSpan('error-span');
    errorSpan.recordException({
      name: 'Error',
      message: 'This is an error',
      stack: 'Error: This is an error',
    });
    errorSpan.end();
  };

  const handleSendLog = () => {
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: 'This is a log',
      attributes: {
        key: 'some value',
      },
    });
  };

  return (
    <>
      <div className={styles.container}>
        Demo
        <div className={styles.actions}>
          <button
            onClick={handleStartSessionSpan}
            disabled={isSessionSpanStarted}>
            Start Session span
          </button>
          <button onClick={handleEndSessionSpan}>End Session Span</button>
        </div>
        <button
          onClick={handleStartSpan}
          disabled={sessionProvider.getSessionSpan() === null}>
          Start Span
        </button>
        <button onClick={handleSendLog}>Send Log</button>
        <button
          onClick={handleRecordException}
          disabled={sessionProvider.getSessionSpan() === null}>
          Record Exception
        </button>
        <div className={styles.spans}>
          {spans.map((span, index) => (
            <div className={styles.span} key={index}>
              <div>Span {index}</div>

              <button onClick={() => handleEndSpan(span, index)}>
                End Span
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default App;
