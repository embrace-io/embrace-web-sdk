import { ExtendedSpan, log, session, trace } from '@embrace-io/web-sdk';
import { EmbraceErrorBoundary } from '@embrace-io/web-sdk/react-instrumentation';

import { AttributeValue, Span } from '@opentelemetry/api';
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
  const [currentSession, setCurrentSession] = useState<AttributeValue | null>(
    null
  );
  const [currentExperience, setCurrentExperience] =
    useState<AttributeValue | null>(null);
  const [previousTabId, setPreviousTabId] = useState<AttributeValue | null>(
    null
  );
  const [currentTabId, setCurrentTabId] = useState<AttributeValue | null>(null);
  const [tabOpenMethod, setTabOpenMethod] = useState<AttributeValue | null>(
    null
  );
  const [referrerType, setReferrerType] = useState<AttributeValue | null>(null);
  const [referrerUrl, setReferrerUrl] = useState<AttributeValue | null>(null);
  const [referrerPath, setReferrerPath] = useState<AttributeValue | null>(null);
  const [referrerDomain, setReferrerDomain] = useState<AttributeValue | null>(
    null
  );
  const [lastActivityTime, setLastActivityTime] = useState<number | null>(null);
  const [sessionRefresher, setSessionRefresher] = useState<
    number | undefined
  >();
  const [navigationType, setNavigationType] =
    useState<RoutingDemoNavigationType | null>(null);

  useEffect(() => {
    setSessionRefresher(
      window.setInterval(() => {
        setCurrentSession(sessionProvider.getSessionId());

        // Get all experience attributes from session span
        const attributes = sessionProvider.getSessionSpan()?.attributes;

        if (!attributes) return;

        // Get experience-related attributes
        const expId = attributes['emb.experience_id'];
        const tabId = attributes['emb.app_instance_id'];
        const prevTabId = attributes['emb.previous_tab_id'];
        const openMethod = attributes['emb.tab_open_method'];
        const refType = attributes['emb.referrer_type'];
        const refPath = attributes['emb.referrer_path'];
        const refDomain = attributes['emb.referrer_domain'];

        // Update state with span attributes (these override direct manager values)
        if (expId) setCurrentExperience(expId);
        if (tabId) setCurrentTabId(tabId);
        if (prevTabId !== undefined) setPreviousTabId(prevTabId || null);
        if (openMethod) setTabOpenMethod(openMethod);
        if (refType) setReferrerType(refType);
        if (refPath !== undefined) setReferrerPath(refPath || null);
        if (refDomain !== undefined) setReferrerDomain(refDomain || null);

        // Get last activity timestamp from sessionStorage
        const storedExperience = sessionStorage.getItem('embrace_experience');
        if (storedExperience) {
          try {
            const experienceData = JSON.parse(storedExperience);
            if (experienceData.lastActivityAt) {
              setLastActivityTime(experienceData.lastActivityAt);
            }
          } catch {
            // Ignore parse errors
          }
        }

        // Reconstruct referrer URL from span attributes
        if (refType === 'same_origin' && refPath) {
          setReferrerUrl(window.location.origin + refPath);
        } else if (refType === 'external' && refDomain) {
          setReferrerUrl(refDomain);
        }
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

        <div
          style={{
            border: '1px solid #f5f5f5',
            padding: '12px',
            marginBottom: '20px',
            borderRadius: '4px',
          }}
        >
          <h3
            style={{
              margin: '0 0 8px 0',
              fontWeight: 'bold',
            }}
          >
            User Experiences
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            {/* Column 1: Referrer Info */}
            <div>
              <strong title="emb.referrer_type">Referrer Type</strong>
              <br />
              {referrerType || 'none'}
            </div>
            <div>
              <strong title="emb.app_instance_id">Current Tab</strong>
              <br />
              {(currentTabId as string)?.slice(-12) || 'none'}
            </div>
            <div>
              <strong title="emb.experience_id">Experience ID</strong>
              <br />
              {(currentExperience as string)?.slice(-12) || 'none'}
            </div>

            <div>
              <strong title="emb.referrer_path">Referrer Path</strong>
              <br />
              {referrerPath || 'n/a'}
            </div>
            <div>
              <strong title="emb.previous_tab_id">Previous Tab</strong>
              <br />
              {(previousTabId as string)?.slice(-12) || 'none'}
            </div>
            <div>
              <strong title="emb.session_id">Session ID</strong>
              <br />
              {(currentSession as string)?.slice(-12) || 'none'}
            </div>

            <div>
              <strong title="emb.referrer_domain">Referrer Domain</strong>
              <br />
              {referrerDomain || 'n/a'}
            </div>
            <div>
              <strong title="emb.tab_open_method">Tab Open Method</strong>
              <br />
              {tabOpenMethod || 'none'}
            </div>
            <div>
              <strong title="from last_activity_time in LocalStorage">
                Last Experience Activity
              </strong>
              <br />
              {lastActivityTime
                ? new Date(Number(lastActivityTime)).toLocaleTimeString()
                : 'none'}
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <strong title="Reconstructed from domain/path">
                Referrer URL (reconstructed)
              </strong>{' '}
              {referrerUrl || 'none'}
            </div>
          </div>
        </div>

        {/* Current Session: */}
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

        {/* Custom Spans: */}
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

        {/* Embrace Logs: */}
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

        {/* Properties: */}
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

        {/* Exceptions: */}
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

        {/* Weird Exceptions: */}
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

        {/* Network: */}
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

        {/* Cancelled Network: */}
        <div className={styles.actions}>
          <button onClick={handleCancelFetchNetworkRequest}>
            Cancel a Fetch Network Request
          </button>
          <button onClick={handleCancelXMLNetworkRequest}>
            Cancel a XML Network Request
          </button>
        </div>

        {/* React: */}
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

        {/* Navigation: */}
        <div className={styles.actions}>
          <a
            href="https://google.com"
            title="External link - creates new experience"
          >
            Navigate to google.com
          </a>
          <a href="/" title="Navigation in same tab - maintains session">
            Open demo in same tab
          </a>
          <a
            href="/"
            target="_blank"
            title="Opens new tab via link - inherits experience"
          >
            Open demo in new tab
          </a>
          <button
            onClick={() => window.open(location.href, '_blank')}
            className={styles.button}
            title="Opens via window.open() - inherits experience"
          >
            window.open()
          </button>
        </div>

        <EmbraceErrorBoundary fallback={() => 'This is the fallback'}>
          <ComponentWithErrorInRender />
        </EmbraceErrorBoundary>
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
