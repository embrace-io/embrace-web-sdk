import styles from './App.module.css';

import {Span, trace} from '@opentelemetry/api';
import {useRef, useState} from 'react';
import {startSessionSpan} from '@embraceio/embrace-web-sdk';
import {loggerProvider} from './otel';
import {SeverityNumber} from '@opentelemetry/api-logs';
import {v4 as uuid} from 'uuid';

const tracer = trace.getTracer('embrace-web-sdk-demo');
const logger = loggerProvider.getLogger('default');

const App = () => {
  const sessionSpan = useRef<Span | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);

  const [isSessionSpanStarted, setIsSessionSpanStarted] = useState(false);

  const handleStartSessionSpan = () => {
    sessionSpan.current = startSessionSpan();
    setIsSessionSpanStarted(true);
  };

  const handleEndSessionSpan = () => {
    if (sessionSpan.current) {
      sessionSpan.current.end();
      setIsSessionSpanStarted(false);

      sessionSpan.current = null;
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

  const handleSendLog = () => {
    logger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: 'This is a log',
      attributes: {
        key: 'some value',
        'log.record.uid': uuid().replace(/-/g, '').toUpperCase(),
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
          disabled={sessionSpan.current === null}>
          Start Span
        </button>
        <button onClick={handleSendLog}>Send Log</button>
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
