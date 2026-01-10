import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

export const render = (children: ReactNode) => {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);

  flushSync(() => {
    root.render(children);
  });

  return {
    container,
    tearDown: () => {
      root.unmount();
      document.body.removeChild(container);
    },
  };
};

export const waitFor = (
  conditionFn: () => boolean,
  interval = 50,
  timeout = 2000,
) => {
  return new Promise<void>((resolve, reject) => {
    const startTime = performance.now();

    const checkCondition = () => {
      if (conditionFn()) {
        resolve();
      } else if (performance.now() - startTime >= timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(checkCondition, interval);
      }
    };

    checkCondition();
  });
};
