import type { Counter, Span } from '@opentelemetry/api';
import { metrics, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { useCallback, useEffect, useState } from 'react';
import styles from './App.module.css';

const ASYNC_MODE = import.meta.env.VITE_ASYNC_MODE === 'true';
const POKEMON_URL = 'https://pokeapi.co/api/v2/pokemon/1/'; // some free and open source random API for testing purposes
const getLazyLogger = () => logs.getLogger('embrace-web-sdk-demo-lazy-logger');
const tracer = trace.getTracer('embrace-web-sdk-demo-tracer');
let userSessionManager = ASYNC_MODE
  ? null
  : // @ts-expect-error
    window.EmbraceWebSdk.session.getUserSessionManager();

const App = () => {
  const [spans, setSpans] = useState<Span[]>([]);
  const [userSessionId, setUserSessionId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(!ASYNC_MODE);

  useEffect(() => {
    if (!initialized) {
      // @ts-expect-error
      window.EmbraceWebSdkOnReady.onReady(() => {
        userSessionManager =
          // @ts-expect-error
          window.EmbraceWebSdk.session.getUserSessionManager();
        setInitialized(true);
      });
    }
  }, [initialized]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (userSessionManager) {
        // @ts-expect-error
        setUserSessionId(window.EmbraceWebSdk.session.getUserSessionId());
      }
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const handleStartSessionPart = () => {
    userSessionManager.startSessionPart();
  };

  const handleEndSessionPart = () => {
    userSessionManager.endSessionPart();
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
    const sessionPartSpan = userSessionManager.getSessionPartSpan();
    if (sessionPartSpan) {
      sessionPartSpan.recordException({
        name: 'Error',
        message: 'This is an error',
        stack: 'Error: This is an error',
      });
    }
  };

  const handleSendLog = () => {
    getLazyLogger().emit({
      severityNumber: SeverityNumber.INFO,
      severityText: 'INFO',
      body: 'This is a log',
      attributes: {
        key: 'some value',
      },
    });
  };

  const handleSendErrorLog = () => {
    getLazyLogger().emit({
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

  const handleSendFetchNetworkRequest404 = () => {
    void fetch('https://example.com/sdk/auto/interception', {
      method: 'GET',
    });
  };

  const handleSendXMLNetworkRequest = () => {
    const req = new XMLHttpRequest();
    req.open('GET', POKEMON_URL, true);
    req.send();
  };

  // handleThrowError Throws an error by going through a set of nested functions to validate stacktraces
  function handleThrowError() {
    handleThrowErrorA(true);
  }

  function handleThrowErrorA(useBranchB: boolean) {
    if (useBranchB) {
      handleThrowErrorB();
    } else {
      handleThrowErrorD();
    }
  }

  function handleThrowErrorB() {
    handleThrowErrorC();
  }

  function handleThrowErrorC() {
    handleThrowErrorA(false);
  }

  function handleThrowErrorD() {
    const e = new Error('This is an error with name ParseError and type Error');
    e.name = 'ParseError';
    throw e;
  }

  const handleRejectPromise = () => {
    return new Promise((_, reject) => {
      reject();
    });
  };

  if (!initialized) {
    return null;
  }

  const isSessionPartStarted = userSessionManager.getSessionPartSpan() !== null;

  return (
    <div className={styles.container}>
      Demo
      <div>user session ID: {userSessionId}</div>
      <div className={styles.actions}>
        <button
          type="button"
          onClick={handleStartSessionPart}
          disabled={isSessionPartStarted}
        >
          Start Session Part
        </button>
        <button
          type="button"
          onClick={handleStartSessionPart}
          disabled={!isSessionPartStarted}
        >
          Override Session Part
        </button>
        <button type="button" onClick={handleEndSessionPart}>
          End Session Part
        </button>
      </div>
      <button
        type="button"
        onClick={handleStartSpan}
        disabled={userSessionManager.getSessionPartSpan() === null}
      >
        Start Span
      </button>
      <button
        type="button"
        onClick={handleSendLog}
        disabled={userSessionManager.getSessionPartSpan() === null}
      >
        Send Log
      </button>
      <button
        type="button"
        onClick={handleSendErrorLog}
        disabled={userSessionManager.getSessionPartSpan() === null}
      >
        Send Error Log
      </button>
      <button
        type="button"
        onClick={handleRecordException}
        disabled={userSessionManager.getSessionPartSpan() === null}
      >
        Record Exception
      </button>
      <button
        type="button"
        onClick={handleThrowError}
        disabled={userSessionManager.getSessionPartSpan() === null}
      >
        Throw Error
      </button>
      <button
        type="button"
        onClick={handleRejectPromise}
        disabled={userSessionManager.getSessionPartSpan() === null}
      >
        Reject Promise
      </button>
      <button type="button" onClick={handleSendFetchNetworkRequest}>
        Send a Fetch Network Request
      </button>
      <button type="button" onClick={handleSendFetchNetworkRequest404}>
        Send a Fetch Network Request (404)
      </button>
      <button type="button" disabled={!!counter} onClick={handleCreateCounter}>
        {counter ? 'counter created' : 'Create Counter'}
      </button>
      <button type="button" disabled={!counter} onClick={handleIncreaseCounter}>
        Increase Counter
      </button>
      <button type="button" onClick={handleSendXMLNetworkRequest}>
        Send a XML Network Request
      </button>
      <div className={styles.spans}>
        {spans.map((span, index) => (
          <div
            className={styles.span}
            key={`span-${span.spanContext().spanId}`}
          >
            <div>Span {index}</div>

            <button type="button" onClick={() => handleEndSpan(span, index)}>
              End Span
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
