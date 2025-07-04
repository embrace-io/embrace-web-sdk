import * as unused from './index.js';
import { expect } from 'chai';

// @ts-expect-error keep this import for testing coverage checking
const _unusedReference = unused;

describe('sdk browser bundle loading', () => {
  it('jsdelivr should serve the cdn bundle under 2000ms', async () => {
    // @ts-expect-error types cannot be resolved dynamically
    // eslint-disable-next-line import/no-unresolved
    await import('https://cdn.jsdelivr.net/npm/@embrace-io/web-sdk');

    // @ts-expect-error sdk should exist in the window
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    void expect(window.EmbraceWebSdk.sdk).to.not.be.undefined;
  });

  it('should be able to dynamically import the cdn bundle', async () => {
    // @ts-expect-error bundle is served on localhost by web-test-runner - not from disk
    // eslint-disable-next-line import/no-unresolved
    await import('/build/iife/bundle.js');

    // @ts-expect-error this is the test
    void expect(window.EmbraceWebSdk).to.not.be.undefined;

    // @ts-expect-error sdk may not exist
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { sdk, NONEXISTENT } = window.EmbraceWebSdk;
    void expect(sdk).to.not.be.undefined;
    void expect(NONEXISTENT).to.be.undefined;
  });
});
