import styles from './App.module.css';

import {Span, trace} from '@opentelemetry/api';
import {useRef, useState} from 'react';
import {startSessionSpan} from '@embraceio/embrace-web-sdk';

const tracer = trace.getTracer('embrace-web-sdk-demo');

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
        <div className={styles.spans}>
          {spans.map((span, index) => (
            <div className={styles.span}>
              <div key={index}>Span {index}</div>

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
