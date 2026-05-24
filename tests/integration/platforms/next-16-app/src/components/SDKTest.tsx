'use client';

import { log, session } from '@embrace-io/web-sdk';
import { embraceWebSdk } from './EmbraceWebSdk.tsx';

const SDKTest = () => {
  const handleEndSession = async () => {
    session.endUserSession();
    if (embraceWebSdk) {
      await embraceWebSdk.flush();
    }
  };

  const handleSendLog = async () => {
    log.message('This is a test log message', 'warning');
    if (embraceWebSdk) {
      await embraceWebSdk.flush();
    }
  };

  const handleNavigateToAnotherPage = () => {
    window.location.href = 'about:blank';
  };

  const handleMakeFetchRequest = () => {
    void fetch('/simulated', { method: 'GET' });
  };

  return (
    <section>
      <button onClick={handleEndSession}>End Session</button>
      <button onClick={handleSendLog}>Send Log</button>
      <button onClick={handleNavigateToAnotherPage}>
        Navigate to Another Page
      </button>
      <button onClick={handleMakeFetchRequest}>Make Fetch Request</button>
    </section>
  );
};

export default SDKTest;
