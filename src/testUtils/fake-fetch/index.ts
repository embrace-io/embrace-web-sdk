import type { SinonStub } from 'sinon';
import * as sinon from 'sinon';

// TODO this helper file could be open sourced as a package

const withRequest = (arg: unknown) => arg instanceof window.Request;

export const getOptions = () =>
  ((window.fetch as SinonStub).firstCall.args[1] || {}) as Parameters<
    typeof window.fetch
  >[1];

export const install = () => {
  sinon.stub(window, 'fetch');
};

export const restore = () => {
  (window.fetch as SinonStub).restore();
};

export const getMethod = () => {
  const firstArg = (window.fetch as SinonStub).firstCall.args[0] as Parameters<
    typeof window.fetch
  >[0];
  if (withRequest(firstArg)) {
    return firstArg.method;
  }
  return getOptions()?.method ?? 'get';
};

export const getBody = () => {
  const firstArg = (window.fetch as SinonStub).firstCall.args[0] as Parameters<
    typeof window.fetch
  >[0];
  if (withRequest(firstArg)) {
    return firstArg.body;
  }
  return getOptions()?.body ?? '';
};

export const getUrl = () => {
  const firstArg = (window.fetch as SinonStub).firstCall.args[0] as Parameters<
    typeof window.fetch
  >[0];
  if (withRequest(firstArg)) {
    return firstArg.url;
  }
  return firstArg;
};

export const getRequestHeaders = () => {
  const firstArg = (window.fetch as SinonStub).firstCall.args[0] as Parameters<
    typeof window.fetch
  >[0];
  if (withRequest(firstArg)) {
    return firstArg.headers;
  }
  return getOptions()?.headers ?? {};
};

export const respondWith = (data: BodyInit, options?: ResponseInit) =>
  (window.fetch as SinonStub).returns(
    Promise.resolve(new Response(data, options))
  );

export const wasCalled = () => !!(window.fetch as SinonStub).firstCall;
