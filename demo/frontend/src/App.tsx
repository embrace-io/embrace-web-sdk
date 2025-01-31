import styles from './App.module.css';

import {Counter, metrics, Span, trace} from '@opentelemetry/api';
import {logs, SeverityNumber} from '@opentelemetry/api-logs';
import {useCallback, useState} from 'react';
import {session} from '@embraceio/embrace-web-sdk';

const POKEMON_URL = 'https://pokeapi.co/api/v2/pokemon/1/'; // some free and open source random API for testing purposes
const tracer = trace.getTracer('embrace-web-sdk-demo-tracer');
const logger = logs.getLogger('embrace-web-sdk-demo-logger');
const sessionProvider = session.getSpanSessionProvider();

const App = () => {
  const [spans, setSpans] = useState<Span[]>([]);

  const [isSessionSpanStarted, setIsSessionSpanStarted] = useState(
    sessionProvider.getSessionSpan() !== null,
  );

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

  const [counter, setCounter] = useState<Counter | null>(null);

  const handleCreateCounter = () => {
    // we need to get the meter here and not at the module level, as it will reference a Noop meter until Embrace SDK is initialized
    // TODO why is this not including a ProxyMeterProvider like logs and traces does?
    const meter = metrics.getMeter('embrace-web-sdk-demo-meter');
    const newCounter = meter.createCounter('counter', {
      description: 'A counter',
    });
    setCounter(newCounter);
  };

  const handleIncreaseCounter = useCallback(() => {
    if (counter) {
      counter.add(1, {
        key: 'some value',
        otherKey: 'other value',
      });
    }
  }, [counter]);

  const handleRecordException = () => {
    const sessionSpan = sessionProvider.getSessionSpan();
    if (sessionSpan) {
      sessionSpan.recordException({
        name: 'Error',
        message: 'This is an error',
        stack: 'Error: This is an error',
      });
    }
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

  const handleSendErrorLog = () => {
    logger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: 'This is a error log',
      attributes: {
        key: 'some value for an error log',
      },
    });
  };

  const handleSendFetchNetworkRequest = () => {
    void fetch(POKEMON_URL, {
      method: 'GET',
    });
  };
  const handleSendXMLNetworkRequest = () => {
    const req = new XMLHttpRequest();
    req.open('GET', POKEMON_URL, true);
    req.send();
  };

  const handleThrowError = () => {
    throw new Error('This is an error');
  };

  const handleRejectPromise = () => {
    return new Promise((_, reject) => {
      reject();
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
        <button
          onClick={handleSendLog}
          disabled={sessionProvider.getSessionSpan() === null}>
          Send Log
        </button>
        <button
          onClick={handleSendErrorLog}
          disabled={sessionProvider.getSessionSpan() === null}>
          Send Error Log
        </button>
        <button
          onClick={handleRecordException}
          disabled={sessionProvider.getSessionSpan() === null}>
          Record Exception
        </button>
        <button
          onClick={handleThrowError}
          disabled={sessionProvider.getSessionSpan() === null}>
          Throw Error
        </button>
        <button
          onClick={handleRejectPromise}
          disabled={sessionProvider.getSessionSpan() === null}>
          Reject Promise
        </button>
        <button onClick={handleSendFetchNetworkRequest}>
          Send a Fetch Network Request
        </button>
        <button disabled={!!counter} onClick={handleCreateCounter}>
          {counter ? 'counter created' : 'Create Counter'}
        </button>
        <button disabled={!counter} onClick={handleIncreaseCounter}>
          Increase Counter
        </button>
        <button onClick={handleSendXMLNetworkRequest}>
          Send a XML Network Request
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
