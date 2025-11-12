'use client';

import { log, session } from '@embrace-io/web-sdk';
import sdkControl from './otel';

const SDKTest = () => {
  const handleEndSession = async () => {
    session.endSessionSpan();

    if (sdkControl) {
      await sdkControl.flush();
    }
  };

  const handleSendLog = async () => {
    log.message('This is a test log message', 'warning');

    if (sdkControl) {
      await sdkControl.flush();
    }
  };

  const handleNavigateToAnotherPage = () => {
    window.location.href = 'about:blank';
  };

  return (
    <section className="flex flex-col gap-4 p-8">
      <button
        type="button"
        onClick={handleEndSession}
        className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-6 rounded-lg shadow-md transition-colors duration-200"
      >
        End Session
      </button>
      <button
        type="button"
        onClick={handleSendLog}
        className="bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-6 rounded-lg shadow-md transition-colors duration-200"
      >
        Send Log
      </button>
      <button
        type="button"
        onClick={handleNavigateToAnotherPage}
        className="bg-purple-500 hover:bg-purple-600 text-white font-medium py-3 px-6 rounded-lg shadow-md transition-colors duration-200"
      >
        Navigate to Another Page
      </button>
    </section>
  );
};

export default SDKTest;
