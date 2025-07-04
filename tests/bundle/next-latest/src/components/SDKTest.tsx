'use client';

import { session, log } from '@embrace-io/web-sdk';
import sdkControl from '@/lib/otel';

const SDKTest = () => {
  const handleEndSession = async () => {
    session.endSessionSpan();

    if (sdkControl) {
      await sdkControl.flush();
    }
  };

  const handleSendLog = async () => {
    log.message('This is a test log message', 'info');

    if (sdkControl) {
      await sdkControl.flush();
    }
  };

  return (
    <section>
      <button onClick={handleEndSession}>End Session</button>
      <button onClick={handleSendLog}>Send Log</button>
    </section>
  );
};

export default SDKTest;
