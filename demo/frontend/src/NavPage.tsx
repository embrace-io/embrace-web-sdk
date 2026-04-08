import { session } from '@embrace-io/web-sdk';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

const sessionProvider = session.getSpanSessionManager();
const navEntry = window.performance.getEntriesByType('navigation')[0] as
  | PerformanceNavigationTiming
  | undefined;

const NavPage = ({
  title,
  nav,
  children,
}: {
  title: string;
  nav?: ReactNode;
  children?: ReactNode;
}) => {
  const [sessionId, setSessionId] = useState<string | null>(null);

  const updateSession = useCallback(() => {
    setSessionId(sessionProvider.getSessionId());
  }, []);

  useEffect(() => {
    updateSession();
    const unsubscribeStart =
      sessionProvider.addSessionStartedListener(updateSession);
    const unsubscribeEnd =
      sessionProvider.addSessionEndedListener(updateSession);
    return () => {
      unsubscribeStart();
      unsubscribeEnd();
    };
  }, [updateSession]);

  return (
    <>
      <fieldset style={{ gridColumn: '1 / -1' }}>
        <legend>{title}</legend>
        {nav && <div className="nav-buttons">{nav}</div>}
        {children}
      </fieldset>
      <fieldset>
        <legend>Navigation Info</legend>
        <dl className="info-list">
          <dt>Performance nav type</dt>
          <dd>{navEntry?.type ?? '—'}</dd>
          <dt>document.referrer</dt>
          <dd>{document.referrer || '—'}</dd>
        </dl>
      </fieldset>
      <fieldset>
        <legend>Session</legend>
        <dl className="info-list">
          <dt>Session ID</dt>
          <dd>{sessionId ?? '—'}</dd>
        </dl>
      </fieldset>
    </>
  );
};

export { NavPage };
