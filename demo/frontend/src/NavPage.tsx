import { session } from '@embrace-io/web-sdk';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

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
  // Resolve at render time, not module load: the proxy's getUserSessionManager()
  // returns the underlying manager directly, and at module load that's still
  // the no-op stand-in (setupSDK runs after this module's imports resolve).
  const userSessionManager = session.getUserSessionManager();
  const [sessionPartId, setSessionPartId] = useState<string | null>(null);
  const [userSessionPartIndex, setUserSessionPartIndex] = useState<
    number | null
  >(null);
  const [sessionPartNumber, setSessionPartNumber] = useState<number | null>(
    null,
  );

  const updateSessionPart = useCallback(() => {
    setSessionPartId(userSessionManager.getSessionPartId());
    const counts = userSessionManager.getSessionPartCounts();
    setUserSessionPartIndex(counts?.userSessionPartIndex ?? null);
    setSessionPartNumber(counts?.sessionPartNumber ?? null);
  }, [userSessionManager]);

  useEffect(() => {
    updateSessionPart();
    const unsubscribeStart =
      userSessionManager.addSessionPartStartedListener(updateSessionPart);
    const unsubscribeEnd =
      userSessionManager.addSessionPartEndedListener(updateSessionPart);
    // The counters are set shortly after a part starts, with no event for it.
    const pollInterval = setInterval(updateSessionPart, 500);
    return () => {
      unsubscribeStart();
      unsubscribeEnd();
      clearInterval(pollInterval);
    };
  }, [userSessionManager, updateSessionPart]);

  return (
    <>
      <fieldset style={{ gridColumn: '1 / -1' }}>
        <legend>{title}</legend>
        {nav ? <div className="nav-buttons">{nav}</div> : null}
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
          <dt>Part index (within user session)</dt>
          <dd>{userSessionPartIndex?.toString() ?? '—'}</dd>
          <dt>Part # (across visits)</dt>
          <dd>{sessionPartNumber?.toString() ?? '—'}</dd>
          <dt>Session Part ID</dt>
          <dd>{sessionPartId ?? '—'}</dd>
        </dl>
      </fieldset>
    </>
  );
};

export { NavPage };
