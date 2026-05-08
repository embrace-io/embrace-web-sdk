import { log, page, session, trace, user } from '@embrace-io/web-sdk';
import { EmbraceErrorBoundary } from '@embrace-io/web-sdk/react-instrumentation';

import type { Span } from '@opentelemetry/api';
import { useEffect, useState } from 'react';
import ComponentWithErrorInRender from './ComponentWithErrorInRender.tsx';
import logo from './logo.png';

const formatValue = (value: string | null, truncate?: boolean): string => {
  if (!value) return '—';
  if (truncate) return value.substring(0, 8);
  return value;
};

const formatTimestamp = (ms: number | null): string => {
  if (ms === null) return '—';
  return new Date(ms).toLocaleTimeString();
};

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const formatSeconds = (seconds: number | null): string => {
  if (seconds === null) return '—';
  return formatDuration(seconds * 1000);
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

const App = () => {
  const userSessionManager = session.getSpanSessionManager();
  const logManager = log.getLogManager();
  const [spans, setSpans] = useState<Span[]>([]);
  const [userSessionId, setUserSessionId] = useState<string | null>(null);
  const [previousUserSessionId, setPreviousUserSessionId] = useState<
    string | null
  >(null);
  const [sessionPartId, setSessionPartId] = useState<string | null>(null);
  const [userSessionNumber, setUserSessionNumber] = useState<number | null>(
    null,
  );
  const [userSessionPartNumber, setUserSessionPartNumber] = useState<
    number | null
  >(null);
  const [userSessionStartTs, setUserSessionStartTs] = useState<number | null>(
    null,
  );
  const [maxDurationSeconds, setMaxDurationSeconds] = useState<number | null>(
    null,
  );
  const [inactivityTimeoutSeconds, setInactivityTimeoutSeconds] = useState<
    number | null
  >(null);
  const [sessionDurationMs, setSessionDurationMs] = useState<number>(0);
  const [partStartTs, setPartStartTs] = useState<number | null>(null);
  const [partDurationMs, setPartDurationMs] = useState<number>(0);
  const [partStartReason, setPartStartReason] = useState<string | null>(null);
  const [isColdStart, setIsColdStart] = useState<boolean | null>(null);
  const [partEndTs, setPartEndTs] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [embraceUserId, setEmbraceUserId] = useState<string | null>(null);
  const [pageLabel, setPageLabel] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: userSessionManager/logManager are stable SDK singletons resolved once after initSDK
  useEffect(() => {
    const updateUserSession = () => {
      setUserSessionId(session.getUserSessionId());
      setPreviousUserSessionId(session.getPreviousUserSessionId());
      const attrs = userSessionManager.getUserSessionAttributes();
      setUserSessionNumber(attrs?.['emb.user_session_number'] ?? null);
      setUserSessionStartTs(attrs?.['emb.user_session_start_ts'] ?? null);
      setMaxDurationSeconds(
        attrs?.['emb.user_session_max_duration_seconds'] ?? null,
      );
      setInactivityTimeoutSeconds(
        attrs?.['emb.user_session_inactivity_timeout_seconds'] ?? null,
      );
    };

    const updateSessionPart = () => {
      setSessionPartId(userSessionManager.getSessionPartId());
      const attrs = userSessionManager.getUserSessionAttributes();
      setUserSessionPartNumber(attrs?.['emb.user_session_part_number'] ?? null);
      const spanAttrs = userSessionManager.getSessionPartSpan()?.attributes;
      const reason = spanAttrs?.['emb.session_part_start_reason'];
      setPartStartReason(typeof reason === 'string' ? reason : null);
      const cold = spanAttrs?.['emb.cold_start'];
      setIsColdStart(typeof cold === 'boolean' ? cold : null);
    };

    const updateUser = () => {
      setUserId(user.getUserId());
      setEmbraceUserId(user.getEmbraceUserId());
    };

    const updatePage = () => {
      setPageLabel(page.getPageLabel());
    };

    const updateAll = () => {
      updateUserSession();
      updateSessionPart();
      updateUser();
      updatePage();
    };

    updateAll();
    // Cold-start part begins inside initSDK, before this effect runs, so the
    // part-start listener has already fired. Seed an approximate start so the
    // duration ticker has something to anchor to.
    if (userSessionManager.getSessionPartId() !== null) {
      setPartStartTs(Date.now());
    }

    const handlePartStart = () => {
      setPartEndTs(null);
      setPartStartTs(Date.now());
      updateUserSession();
      updateSessionPart();
    };
    const handlePartEnd = () => {
      setPartEndTs(Date.now());
      // End listeners fire before the SDK clears the part span, so defer the
      // re-read until after the SDK finishes cleaning up its state.
      queueMicrotask(updateSessionPart);
    };

    const unsubscribePartStart =
      userSessionManager.addSessionPartStartedListener(handlePartStart);
    const unsubscribePartEnd =
      userSessionManager.addSessionPartEndedListener(handlePartEnd);

    // user / page APIs have no listener hook; poll to keep the panel live.
    // Also refresh immediately on focus / visibility gain so the display is
    // current the moment this tab becomes engaged again.
    //
    // Demo-only: customer apps should not need this; they receive part
    // lifecycle events via the internal listeners above and read user / page
    // values lazily on render.
    const pollInterval = setInterval(updateAll, 500);
    window.addEventListener('focus', updateAll);
    document.addEventListener('visibilitychange', updateAll);

    return () => {
      unsubscribePartStart();
      unsubscribePartEnd();
      clearInterval(pollInterval);
      window.removeEventListener('focus', updateAll);
      document.removeEventListener('visibilitychange', updateAll);
    };
  }, []);

  useEffect(() => {
    if (userSessionStartTs === null) {
      setSessionDurationMs(0);
      return;
    }
    const tick = () => setSessionDurationMs(Date.now() - userSessionStartTs);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [userSessionStartTs]);

  useEffect(() => {
    if (partStartTs === null) {
      setPartDurationMs(0);
      return;
    }
    if (partEndTs !== null) {
      setPartDurationMs(partEndTs - partStartTs);
      return;
    }
    const tick = () =>
      setPartDurationMs(
        performance.timeOrigin + performance.now() - partStartTs,
      );
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [partStartTs, partEndTs]);

  const handleEndUserSession = () => {
    session.endUserSession();
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
    const sessionPartSpan = userSessionManager.getSessionPartSpan();
    if (sessionPartSpan) {
      sessionPartSpan.recordException({
        name: 'Error',
        message: 'This is an error',
        stack: 'Error: This is an error',
      });
    }
  };

  const handleAddPermanentSessionProperty = (key: string, value: string) => {
    const sessionPartSpan = userSessionManager.getSessionPartSpan();
    if (sessionPartSpan) {
      session.addProperty(key, value, {
        lifespan: 'permanent',
      });
    }
  };

  const handleAddSessionProperty = (key: string, value: string) => {
    const sessionPartSpan = userSessionManager.getSessionPartSpan();
    if (sessionPartSpan) {
      session.addProperty(key, value);
    }
  };

  const handleRemoveSessionProperty = (key: string) => {
    const sessionPartSpan = userSessionManager.getSessionPartSpan();
    if (sessionPartSpan) {
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

  const loafDurations = [200, 400, 600, 800];

  const handleLoadLoafScripts = () => {
    for (const duration of loafDurations) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = `${import.meta.env.BASE_URL}loaf${duration}.js`;
      script.onerror = () => {
        console.error(`failed to load loaf script ${duration}`);
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

  const handleTriggerMark = () => {
    performance.mark('demo-mark', { detail: { source: 'demo' } });
  };

  const handleTriggerMeasure = () => {
    const mark = performance.mark('demo-measure-start');
    setTimeout(
      () => {
        performance.measure('demo-measure', {
          start: mark.startTime,
          detail: { source: 'demo' },
        });
      },
      Math.floor(Math.random() * 500) + 100,
    );
  };

  return (
    <>
      <fieldset style={{ gridColumn: '1 / -1' }}>
        <legend>User Session</legend>
        <dl className="info-list info-list-grid">
          <InfoItem
            label="User Session #"
            value={userSessionNumber?.toString() ?? null}
          />
          <InfoItem label="ID" value={userSessionId} truncate />
          <InfoItem
            label="Previous ID"
            value={previousUserSessionId}
            truncate
          />
          <InfoItem
            label="Started"
            value={formatTimestamp(userSessionStartTs)}
          />
          <InfoItem
            label="Duration"
            value={
              userSessionStartTs === null
                ? null
                : formatDuration(sessionDurationMs)
            }
          />
        </dl>
      </fieldset>

      <fieldset style={{ gridColumn: '1 / -1' }}>
        <legend>Session Part</legend>
        <dl className="info-list info-list-grid">
          <InfoItem
            label="Part #"
            value={userSessionPartNumber?.toString() ?? null}
          />
          <InfoItem label="ID" value={sessionPartId} truncate />
          <InfoItem label="Started" value={formatTimestamp(partStartTs)} />
          <InfoItem
            label="Duration"
            value={partStartTs === null ? null : formatDuration(partDurationMs)}
          />
          <InfoItem label="Start Reason" value={partStartReason} />
          <InfoItem
            label="Cold Start"
            value={isColdStart === null ? null : isColdStart ? 'yes' : 'no'}
          />
        </dl>
      </fieldset>

      <fieldset style={{ gridColumn: '1 / -1' }}>
        <legend>Session Config (locked at creation)</legend>
        <dl className="info-list info-list-horizontal">
          <InfoItem
            label="Max Duration"
            value={formatSeconds(maxDurationSeconds)}
          />
          <InfoItem
            label="Inactivity Timeout"
            value={formatSeconds(inactivityTimeoutSeconds)}
          />
        </dl>
      </fieldset>

      <fieldset style={{ gridColumn: '1 / -1' }}>
        <legend>Context</legend>
        <dl className="info-list info-list-horizontal">
          <InfoItem
            label="Part Status"
            value={
              sessionPartId !== null
                ? `active (foreground; started ${partStartReason ?? '—'})`
                : partEndTs !== null
                  ? `inactive (ended ${formatTimestamp(partEndTs)})`
                  : 'inactive'
            }
          />
          <InfoItem label="Page Label" value={pageLabel} />
          <InfoItem label="User ID" value={userId} />
          <InfoItem label="Embrace User ID" value={embraceUserId} truncate />
        </dl>
      </fieldset>

      <fieldset>
        <legend>Session Control</legend>
        <div className="actions">
          <button
            type="button"
            onClick={handleEndUserSession}
            disabled={userSessionManager.getSessionPartSpan() === null}
            title="End the current user session; a new one starts on the next foreground part"
          >
            End User Session
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Custom Spans</legend>
        <button
          type="button"
          onClick={handleStartSpan}
          disabled={userSessionManager.getSessionPartSpan() === null}
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
            disabled={userSessionManager.getSessionPartSpan() === null}
          >
            Send Embrace Info Log
          </button>
          <button
            type="button"
            onClick={handleSendEmbraceWarnLog}
            disabled={userSessionManager.getSessionPartSpan() === null}
          >
            Send Embrace Warning Log
          </button>
          <button
            type="button"
            onClick={handleSendEmbraceErrorLog}
            disabled={userSessionManager.getSessionPartSpan() === null}
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
            disabled={userSessionManager.getSessionPartSpan() === null}
          >
            Add Permanent Session Property
          </button>

          <button
            type="button"
            onClick={() => handleRemoveSessionProperty('permanent-key')}
            disabled={userSessionManager.getSessionPartSpan() === null}
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
            disabled={userSessionManager.getSessionPartSpan() === null}
          >
            Add Session Property
          </button>
          <button
            type="button"
            onClick={() => handleRemoveSessionProperty('session-key')}
            disabled={userSessionManager.getSessionPartSpan() === null}
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
        </div>

        <div className="actions">
          <button
            type="button"
            onClick={handleThrowDOMException}
            disabled={userSessionManager.getSessionPartSpan() === null}
          >
            Throw DOM Exception
          </button>
          <button
            type="button"
            onClick={handleThrowString}
            disabled={userSessionManager.getSessionPartSpan() === null}
          >
            Throw String
          </button>
          <button
            type="button"
            onClick={handleThrowUndefined}
            disabled={userSessionManager.getSessionPartSpan() === null}
          >
            Throw Undefined
          </button>
          <button
            type="button"
            onClick={handleFailedResourceLoad}
            disabled={userSessionManager.getSessionPartSpan() === null}
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
          <button type="button" onClick={handleEndUserSession}>
            End User Session (flush LoAF report)
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

      <fieldset>
        <legend>Browser Timing</legend>
        <div className="actions">
          <button type="button" onClick={handleTriggerMark}>
            Trigger Mark
          </button>
          <button type="button" onClick={handleTriggerMeasure}>
            Trigger Measure
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Element Timing</legend>
        <p>
          Elements below are tagged with the <code>elementtiming</code>{' '}
          attribute. The instrumentation captures a span for each when it is
          first painted.
        </p>
        <img
          src={logo}
          alt="Element timing demo"
          width={80}
          {...({ elementtiming: 'demo-image' } as object)}
        />
        <p {...({ elementtiming: 'demo-text' } as object)}>
          This text element is tracked with element timing.
        </p>
      </fieldset>
    </>
  );
};

export default App;
