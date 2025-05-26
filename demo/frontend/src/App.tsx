import { log, session, trace } from '@embrace-io/web-sdk';

import { Span } from '@opentelemetry/api';
import { useEffect, useState } from 'react';
import styles from './App.module.css';

const POKEMON_URL = 'https://pokeapi.co/api/v2/pokemon/1/'; // some free and open source random API for testing purposes
const sessionProvider = session.getSpanSessionManager();
const logManager = log.getLogManager();

const App = () => {
  const [spans, setSpans] = useState<Span[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [sessionRefresher, setSessionRefresher] = useState<
    number | undefined
  >();

  useEffect(() => {
    setSessionRefresher(
      window.setInterval(() => {
        setCurrentSession(sessionProvider.getSessionId());
      }, 1000)
    );
    return () => window.clearInterval(sessionRefresher);
  }, []);

  const handleStartSessionSpan = () => {
    sessionProvider.startSessionSpan();
  };

  const handleEndSessionSpan = () => {
    sessionProvider.endSessionSpan();
  };

  const handleStartSpan = () => {
    const span = trace.startSpan('demo-span');

    if (span) {
      setSpans([...spans, span]);
    }
  };

  const handleEndSpan = (span: Span, index: number) => {
    span.end();

    const newSpans = [...spans];
    newSpans.splice(index, 1);

    setSpans(newSpans);
  };

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

  const handleSendEmbraceInfoLog = () => {
    logManager.message('This is an info log', 'info', {
      attributes: {
        key: 'some value for an info log',
      },
    });
  };

  const handleSendEmbraceWarnLog = () => {
    logManager.message('This is a warning log', 'warning', {
      attributes: {
        key: 'some value for an info log',
      },
    });
  };

  const handleSendEmbraceErrorLog = () => {
    logManager.message('This is an error log', 'error', {
      attributes: {
        key: 'some value for an info log',
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

  const isSessionSpanStarted = sessionProvider.getSessionSpan() !== null;

  return (
    <>
      <div className={styles.container}>
        Demo
        <div>current session: {currentSession}</div>
        <div className={styles.actions}>
          <button
            onClick={handleStartSessionSpan}
            disabled={isSessionSpanStarted}
          >
            Start Session span
          </button>
          <button
            onClick={handleStartSessionSpan}
            disabled={!isSessionSpanStarted}
          >
            Override Session span
          </button>
          <button onClick={handleEndSessionSpan}>End Session Span</button>
        </div>
        <button
          onClick={handleStartSpan}
          disabled={sessionProvider.getSessionSpan() === null}
        >
          Start Span
        </button>
        <button
          onClick={handleSendEmbraceInfoLog}
          disabled={sessionProvider.getSessionSpan() === null}
        >
          Send Embrace Info Log
        </button>
        <button
          onClick={handleSendEmbraceWarnLog}
          disabled={sessionProvider.getSessionSpan() === null}
        >
          Send Embrace Warning Log
        </button>
        <button
          onClick={handleSendEmbraceErrorLog}
          disabled={sessionProvider.getSessionSpan() === null}
        >
          Send Embrace Error Log
        </button>
        <button
          onClick={handleRecordException}
          disabled={sessionProvider.getSessionSpan() === null}
        >
          Record Exception
        </button>
        <button
          onClick={handleThrowError}
          disabled={sessionProvider.getSessionSpan() === null}
        >
          Throw Error
        </button>
        <button
          onClick={handleRejectPromise}
          disabled={sessionProvider.getSessionSpan() === null}
        >
          Reject Promise
        </button>
        <button onClick={handleSendFetchNetworkRequest}>
          Send a Fetch Network Request
        </button>
        <button onClick={handleSendFetchNetworkRequest404}>
          Send a Fetch Network Request (404)
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
