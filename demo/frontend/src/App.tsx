import { log, session, trace } from '@embrace-io/web-sdk';
import { EmbraceErrorBoundary } from '@embrace-io/web-sdk/react-instrumentation';

import { Span } from '@opentelemetry/api';
import { useEffect, useState } from 'react';
import styles from './App.module.css';
import {
  RoutingDemoContextProvider,
  RoutingDemoNavigationType,
} from './RoutingDemo/RoutingDemoContext';
import ReactRouterV4V5 from './RoutingDemo/ReactRouterV4V5';
import ReactRouterV6Declarative from './RoutingDemo/ReactRouterV6Declarative';
import ReactRouterV6Data from './RoutingDemo/ReactRouterV6Data';
import ComponentWithErrorInRender from './ComponentWithErrorInRender';

const POKEMON_URL = 'https://pokeapi.co/api/v2/pokemon/1/'; // some free and open source random API for testing purposes
const sessionProvider = session.getSpanSessionManager();
const logManager = log.getLogManager();

const App = () => {
  const [spans, setSpans] = useState<Span[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [sessionRefresher, setSessionRefresher] = useState<
    number | undefined
  >();
  const [navigationType, setNavigationType] =
    useState<RoutingDemoNavigationType | null>(null);

  // Tab tracking data
  const [experienceId, setExperienceId] = useState<string | null>('');
  const [tabId, setTabId] = useState<string | null>('');
  const [sourceTabId, setSourceTabId] = useState<string | null>(null);
  const [navigationSource, setNavigationSource] = useState<string | null>(null);
  const [referrerUrl, setReferrerUrl] = useState<string | null>(null);

  const updateCrossTabData = () => {
    const sessionSpan = sessionProvider.getSessionSpan();
    if (sessionSpan && 'attributes' in sessionSpan) {
      const attrs = (sessionSpan as any).attributes;
      setExperienceId(attrs['emb.experience_id'] || null);
      setTabId(attrs['emb.tab_id'] || null);
      setSourceTabId(attrs['emb.source_tab_id'] || null);
      setNavigationSource(attrs['emb.navigation_source'] || null);
      setReferrerUrl(attrs['emb.referrer_url'] || null);
    }
  };

  useEffect(() => {
    // Set initial values
    setCurrentSession(sessionProvider.getSessionId());
    updateCrossTabData();

    setSessionRefresher(
      window.setInterval(() => {
        setCurrentSession(sessionProvider.getSessionId());
        updateCrossTabData();
      }, 1000)
    );

    return () => {
      window.clearInterval(sessionRefresher);
    };
  }, []);

  const handleStartSessionSpan = () => {
    sessionProvider.startSessionSpan();
    setCurrentSession(sessionProvider.getSessionId());
    updateCrossTabData();
  };

  const handleEndSessionSpan = () => {
    sessionProvider.endSessionSpan();
    setCurrentSession(sessionProvider.getSessionId());
    updateCrossTabData();
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

  const handleAddPermanentSessionProperty = (key: string, value: string) => {
    const sessionSpan = sessionProvider.getSessionSpan();
    if (sessionSpan) {
      session.addProperty(key, value, {
        lifespan: 'permanent',
      });
    }
  };

  const handleAddSessionProperty = (key: string, value: string) => {
    const sessionSpan = sessionProvider.getSessionSpan();
    if (sessionSpan) {
      session.addProperty(key, value);
    }
  };

  const handleRemoveSessionProperty = (key: string) => {
    const sessionSpan = sessionProvider.getSessionSpan();
    if (sessionSpan) {
      session.removeProperty(key);
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
        key: 'some value for an warning log',
      },
    });
  };

  const handleSendEmbraceErrorLog = () => {
    logManager.message('This is an error log', 'error', {
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

  const handleCancelFetchNetworkRequest = () => {
    const controller = new AbortController();
    void fetch(POKEMON_URL, {
      method: 'GET',
      signal: controller.signal,
    });

    controller.abort();
  };

  const handleCancelXMLNetworkRequest = () => {
    const req = new XMLHttpRequest();
    req.open('GET', POKEMON_URL, true);
    req.send();
    req.abort();
  };

  const handleThrowDOMException = () => {
    window.atob('!@#$');
  };

  const handleThrowString = () => {
    throw 'my error as a string';
  };

  const handleThrowUndefined = () => {
    throw undefined;
  };

  const handleFailedResourceLoad = () => {
    var img = document.createElement('img');
    img.src = '/something/that/doesnotexist.png';
    document.body.appendChild(img);
  };

  // handleThrowError Throws an error by going through a set of nested functions to validate stacktraces
  const handleThrowError = () => {
    handleThrowErrorA(true);
  };

  const handleThrowErrorA = (useBranchB: boolean) => {
    if (useBranchB) {
      handleThrowErrorB();
    } else {
      handleThrowErrorD();
    }
  };

  const handleThrowErrorB = () => {
    handleThrowErrorC();
  };

  const handleThrowErrorC = () => {
    handleThrowErrorA(false);
  };

  const handleThrowErrorD = () => {
    const e = new Error('This is an error with name ParseError and type Error');
    e.name = 'ParseError';
    throw e;
  };

  const handleRejectPromise = () => {
    return new Promise((_, reject) => {
      reject();
    });
  };

  const isSessionSpanStarted = sessionProvider.getSessionSpan() !== null;

  const renderContent = () => {
    if (navigationType) {
      switch (navigationType) {
        case 'declarativeV4V5':
          return <ReactRouterV4V5 />;
        case 'declarativeV6+':
          return <ReactRouterV6Declarative />;
        case 'data':
          return <ReactRouterV6Data />;
      }
    }

    return (
      <div className="container">
        <h1>[••] demo</h1>
        <div className={styles.sessionInfo}>
          <div className={styles.sessionRow}>
            <span className={styles.sessionLabel}>Session ID:</span>
            <span
              className={styles.sessionValue}
              title={currentSession || undefined}
            >
              {currentSession ? currentSession.substring(0, 8) : '-'}
            </span>
          </div>
          <div className={styles.sessionRow}>
            <span className={styles.sessionLabel}>Tab ID:</span>
            <span className={styles.sessionValue} title={tabId || undefined}>
              {tabId ? tabId.substring(0, 8) : '-'}
            </span>
          </div>
          <div className={styles.sessionRow}>
            <span className={styles.sessionLabel}>Source Tab ID:</span>
            <span
              className={styles.sessionValue}
              title={sourceTabId || undefined}
            >
              {sourceTabId ? sourceTabId.substring(0, 8) : '-'}
            </span>
          </div>
          <div className={styles.sessionRow}>
            <span className={styles.sessionLabel}>Experience ID:</span>
            <span
              className={styles.sessionValue}
              title={experienceId || undefined}
            >
              {experienceId ? experienceId.substring(0, 8) : '-'}
            </span>
          </div>
          <div className={styles.sessionRow}>
            <span className={styles.sessionLabel}>Navigation Source:</span>
            <span className={styles.sessionValue}>
              {navigationSource || '-'}
            </span>
          </div>
          <div className={styles.sessionRow}>
            <span className={styles.sessionLabel}>Referrer URL:</span>
            <span
              className={styles.sessionValue}
              title={referrerUrl || undefined}
            >
              {referrerUrl || '-'}
            </span>
          </div>
        </div>

        <fieldset>
          <legend>Session Control</legend>
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
              title="Force a new Session Span to start"
            >
              Override Session span
            </button>
            <button
              onClick={handleEndSessionSpan}
              disabled={sessionProvider.getSessionSpan() === null}
            >
              End Session Span
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Custom Spans</legend>
          <button
            onClick={handleStartSpan}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Start Span
          </button>
          {spans.length > 0 && (
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
          )}
        </fieldset>

        <fieldset>
          <legend>Embrace Logs</legend>
          <div className={styles.actions}>
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
          </div>
        </fieldset>

        <fieldset>
          <legend>Session Properties</legend>
          <div className={styles.actions}>
            <button
              onClick={() =>
                handleAddPermanentSessionProperty(
                  'permanent-key',
                  'permanent-value'
                )
              }
              disabled={sessionProvider.getSessionSpan() === null}
            >
              Add Permanent Session Property
            </button>

            <button
              onClick={() => handleRemoveSessionProperty('permanent-key')}
              disabled={sessionProvider.getSessionSpan() === null}
            >
              Remove Permanent Session Property
            </button>
          </div>
          <div className={styles.actions}>
            <button
              onClick={() =>
                handleAddSessionProperty('session-key', 'session-value')
              }
              disabled={sessionProvider.getSessionSpan() === null}
            >
              Add Session Property
            </button>
            <button
              onClick={() => handleRemoveSessionProperty('session-key')}
              disabled={sessionProvider.getSessionSpan() === null}
            >
              Remove Session Property
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Exceptions</legend>
          <div className={styles.actions}>
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
          </div>

          <div className={styles.actions}>
            <button
              onClick={handleThrowDOMException}
              disabled={sessionProvider.getSessionSpan() === null}
            >
              Throw DOM Exception
            </button>
            <button
              onClick={handleThrowString}
              disabled={sessionProvider.getSessionSpan() === null}
            >
              Throw String
            </button>
            <button
              onClick={handleThrowUndefined}
              disabled={sessionProvider.getSessionSpan() === null}
            >
              Throw Undefined
            </button>
            <button
              onClick={handleFailedResourceLoad}
              disabled={sessionProvider.getSessionSpan() === null}
            >
              Trigger Failed Resource Load
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Network Requests</legend>
          <div className={styles.actions}>
            <button onClick={handleSendFetchNetworkRequest}>
              Send a Fetch Network Request
            </button>
            <button onClick={handleSendFetchNetworkRequest404}>
              Send a Fetch Network Request (404)
            </button>
            <button onClick={handleSendXMLNetworkRequest}>
              Send a XML Network Request
            </button>
          </div>

          <div className={styles.actions}>
            <button onClick={handleCancelFetchNetworkRequest}>
              Cancel a Fetch Network Request
            </button>
            <button onClick={handleCancelXMLNetworkRequest}>
              Cancel a XML Network Request
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>React Router Demos</legend>
          <div className={styles.actions}>
            <button onClick={() => setNavigationType('declarativeV4V5')}>
              Enter react-router v4/v5 navigation demo
            </button>
            <button onClick={() => setNavigationType('declarativeV6+')}>
              Enter react-router v6+ declarative navigation demo
            </button>
            <button onClick={() => setNavigationType('data')}>
              Enter react-router v6+ data navigation demo
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend>Navigation</legend>
          <div className={styles.actions}>
            <a href="https://google.com">Navigate to google.com</a>
            <a href="/">Open demo in same tab</a>
            <a href="/" target="_blank">
              Open demo in new tab
            </a>
          </div>
        </fieldset>

        <fieldset>
          <legend>React Error Boundary</legend>
          <div className={styles.actions}>
            <button onClick={() => window.location.reload()}>
              Trigger a render error inside EmbraceErrorBoundary
            </button>
          </div>
          <EmbraceErrorBoundary fallback={() => 'This is the fallback'}>
            <ComponentWithErrorInRender />
          </EmbraceErrorBoundary>
        </fieldset>
      </div>
    );
  };

  return (
    <RoutingDemoContextProvider value={{ navigationType, setNavigationType }}>
      {renderContent()}
    </RoutingDemoContextProvider>
  );
};

export default App;
