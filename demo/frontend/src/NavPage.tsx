import { session } from '@embrace-io/web-sdk';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

const userSessionManager = session.getUserSessionManager();
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
  const [sessionPartId, setSessionPartId] = useState<string | null>(null);

  const updateSessionPart = useCallback(() => {
    setSessionPartId(userSessionManager.getSessionPartId());
  }, []);

  useEffect(() => {
    updateSessionPart();
    const unsubscribeStart =
      userSessionManager.addSessionPartStartedListener(updateSessionPart);
    const unsubscribeEnd =
      userSessionManager.addSessionPartEndedListener(updateSessionPart);
    // Keep the part-id display live across cross-tab storage events and
    // focus/visibility changes, matching App.tsx.
    const pollInterval = setInterval(updateSessionPart, 500);
    window.addEventListener('focus', updateSessionPart);
    document.addEventListener('visibilitychange', updateSessionPart);
    window.addEventListener('storage', updateSessionPart);
    return () => {
      unsubscribeStart();
      unsubscribeEnd();
      clearInterval(pollInterval);
      window.removeEventListener('focus', updateSessionPart);
      document.removeEventListener('visibilitychange', updateSessionPart);
      window.removeEventListener('storage', updateSessionPart);
    };
  }, [updateSessionPart]);

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
        <legend>Session Part</legend>
        <dl className="info-list">
          <dt>Session Part ID</dt>
          <dd>{sessionPartId ?? '—'}</dd>
        </dl>
      </fieldset>
    </>
  );
};

export { NavPage };
