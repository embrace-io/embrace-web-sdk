import { log, session, trace } from '@embrace-io/web-sdk';
import { EmbraceErrorBoundary } from '@embrace-io/web-sdk/react-instrumentation';

import type { Span } from '@opentelemetry/api';
import { useCallback, useEffect, useState } from 'react';
import ComponentWithErrorInRender from './ComponentWithErrorInRender.tsx';
import { getSessionAttributes } from './utils.ts';

const formatValue = (value: string | null, truncate?: boolean): string => {
  if (!value) return '—';
  if (truncate) return value.substring(0, 8);
  return value;
};

const InfoItem = ({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string | null;
  truncate?: boolean;
}) => (
  <div>
    <dt>{label}</dt>
    <dd title={value || undefined}>{formatValue(value, truncate)}</dd>
  </div>
);

const POKEMON_URL = 'https://pokeapi.co/api/v2/pokemon/1/'; // some free and open source random API for testing purposes
const sessionProvider = session.getSpanSessionManager();
const logManager = log.getLogManager();

const App = () => {
  const [spans, setSpans] = useState<Span[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);

  // Tab tracking data
  const [experienceId, setExperienceId] = useState<string | null>(null);
  const [tabId, setTabId] = useState<string | null>(null);
  const [sourceTabId, setSourceTabId] = useState<string | null>(null);
  const [navigationSource, setNavigationSource] = useState<string | null>(null);
  const [referrerUrl, setReferrerUrl] = useState<string | null>(null);

  const updateCrossTabData = useCallback(() => {
    const attrs = getSessionAttributes();
    setExperienceId(attrs?.['emb.experience_id'] ?? null);
    setTabId(attrs?.['emb.tab_id'] ?? null);
    setSourceTabId(attrs?.['emb.source_tab_id'] ?? null);
    setNavigationSource(attrs?.['emb.navigation_source'] ?? null);
    setReferrerUrl(attrs?.['emb.referrer_url'] ?? null);
  }, []);

  useEffect(() => {
    const updateSession = () => {
      setCurrentSession(sessionProvider.getSessionId());
      updateCrossTabData();
    };

    // Set initial values
    updateSession();

    // React to session lifecycle events
    const unsubscribeStart =
      sessionProvider.addSessionStartedListener(updateSession);
    const unsubscribeEnd =
      sessionProvider.addSessionEndedListener(updateSession);

    return () => {
      unsubscribeStart();
      unsubscribeEnd();
    };
  }, [updateCrossTabData]);

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
    const img = document.createElement('img');
    img.src = '/something/that/doesnotexist.png';
    document.body.appendChild(img);
  };

  const handleTriggerLoaf = () => {
    const start = performance.now();
    while (performance.now() - start < 200) {
      /* block main thread to trigger a long animation frame */
    }
  };

  const handleTriggerLoafNonInteraction = () => {
    setTimeout(() => {
      const start = performance.now();
      while (performance.now() - start < 200) {
        /* block main thread to trigger a long animation frame */
      }
    }, 100);
  };

  const handleLoadLoafScripts = () => {
    for (let i = 1; i <= 4; i++) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = `http://localhost:3001/loaf/${i}`;
      script.onerror = () => {
        console.error(`failed to load loaf script ${i}`);
      };
      document.body.appendChild(script);
    }
  };

  const handleTriggerLoafRandom = () => {
    const duration = Math.floor(Math.random() * 500) + 100;
    const start = performance.now();
    while (performance.now() - start < duration) {
      /* block main thread for a random 100–600ms */
    }
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

  return (
    <>
      <fieldset style={{ gridColumn: '1 / -1' }}>
        <legend>Experience</legend>
        <dl className="info-list info-list-horizontal">
          <InfoItem label="Session ID" value={currentSession} truncate />
          <InfoItem label="Tab ID" value={tabId} truncate />
          <InfoItem label="Source Tab ID" value={sourceTabId} truncate />
          <InfoItem label="Experience ID" value={experienceId} truncate />
          <InfoItem label="Navigation Source" value={navigationSource} />
          <InfoItem label="Referrer URL" value={referrerUrl} />
        </dl>
      </fieldset>

      <fieldset>
        <legend>Session Control</legend>
        <div className="actions">
          <button
            type="button"
            onClick={handleStartSessionSpan}
            disabled={sessionProvider.getSessionSpan() !== null}
          >
            Start Session span
          </button>
          <button
            type="button"
            onClick={handleStartSessionSpan}
            disabled={sessionProvider.getSessionSpan() === null}
            title="Force a new Session Span to start"
          >
            Override Session span
          </button>
          <button
            type="button"
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
          type="button"
          onClick={handleStartSpan}
          disabled={sessionProvider.getSessionSpan() === null}
        >
          Start Span
        </button>
        {spans.length > 0 && (
          <div className="spans">
            {spans.map((span, index) => (
              <div className="span" key={`span-${span.spanContext().spanId}`}>
                <div>Span {index}</div>

                <button
                  type="button"
                  onClick={() => handleEndSpan(span, index)}
                >
                  End Span
                </button>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend>Embrace Logs</legend>
        <div className="actions">
          <button
            type="button"
            onClick={handleSendEmbraceInfoLog}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Send Embrace Info Log
          </button>
          <button
            type="button"
            onClick={handleSendEmbraceWarnLog}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Send Embrace Warning Log
          </button>
          <button
            type="button"
            onClick={handleSendEmbraceErrorLog}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Send Embrace Error Log
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Session Properties</legend>
        <div className="actions">
          <button
            type="button"
            onClick={() =>
              handleAddPermanentSessionProperty(
                'permanent-key',
                'permanent-value',
              )
            }
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Add Permanent Session Property
          </button>

          <button
            type="button"
            onClick={() => handleRemoveSessionProperty('permanent-key')}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Remove Permanent Session Property
          </button>
        </div>
        <div className="actions">
          <button
            type="button"
            onClick={() =>
              handleAddSessionProperty('session-key', 'session-value')
            }
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Add Session Property
          </button>
          <button
            type="button"
            onClick={() => handleRemoveSessionProperty('session-key')}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Remove Session Property
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Exceptions</legend>
        <div className="actions">
          <button
            type="button"
            onClick={handleRecordException}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Record Exception
          </button>
          <button
            type="button"
            onClick={handleThrowError}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Throw Error
          </button>
          <button
            type="button"
            onClick={handleRejectPromise}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Reject Promise
          </button>
        </div>

        <div className="actions">
          <button
            type="button"
            onClick={handleThrowDOMException}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Throw DOM Exception
          </button>
          <button
            type="button"
            onClick={handleThrowString}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Throw String
          </button>
          <button
            type="button"
            onClick={handleThrowUndefined}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Throw Undefined
          </button>
          <button
            type="button"
            onClick={handleFailedResourceLoad}
            disabled={sessionProvider.getSessionSpan() === null}
          >
            Trigger Failed Resource Load
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Network Requests</legend>
        <div className="actions">
          <button type="button" onClick={handleSendFetchNetworkRequest}>
            Send a Fetch Network Request
          </button>
          <button type="button" onClick={handleSendFetchNetworkRequest404}>
            Send a Fetch Network Request (404)
          </button>
          <button type="button" onClick={handleSendXMLNetworkRequest}>
            Send a XML Network Request
          </button>
        </div>

        <div className="actions">
          <button type="button" onClick={handleCancelFetchNetworkRequest}>
            Cancel a Fetch Network Request
          </button>
          <button type="button" onClick={handleCancelXMLNetworkRequest}>
            Cancel a XML Network Request
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>LoAF</legend>
        <div className="actions">
          <button type="button" onClick={handleTriggerLoaf}>
            Block Main Thread (200ms)
          </button>
          <button type="button" onClick={handleTriggerLoafNonInteraction}>
            Block Main Thread (200ms, non-interaction)
          </button>
          <button type="button" onClick={handleTriggerLoafRandom}>
            Block Main Thread (100–600ms random)
          </button>
          <button type="button" onClick={handleLoadLoafScripts}>
            Load LoAF Scripts (x4)
          </button>
          <button type="button" onClick={handleEndSessionSpan}>
            End Session (flush LoAF report)
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>React Render Errors</legend>
        <div>
          <p>Inside an error boundary:</p>
          <EmbraceErrorBoundary fallback={() => 'This is the fallback'}>
            <ComponentWithErrorInRender />
          </EmbraceErrorBoundary>
        </div>
        <div>
          <p>Outside an error boundary:</p>
          <ComponentWithErrorInRender />
        </div>
      </fieldset>
    </>
  );
};

export default App;
