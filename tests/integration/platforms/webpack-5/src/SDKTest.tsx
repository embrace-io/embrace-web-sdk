import React from 'react';
import { session, log } from '@embrace-io/web-sdk';
import { sdkControl } from './otel';

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

  const handleNavigateToAnotherPage = () => {
    window.location.href = 'about:blank';
  };

  return (
    <section>
      <button onClick={handleEndSession}>End Session</button>
      <button onClick={handleSendLog}>Send Log</button>
      <button onClick={handleNavigateToAnotherPage}>
        Navigate to Another Page
      </button>
    </section>
  );
};

export default SDKTest;
