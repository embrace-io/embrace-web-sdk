import type { SinonStub } from 'sinon';
import * as sinon from 'sinon';

// TODO this helper file could be open sourced as a separate package

const withRequest = (arg: unknown) => arg instanceof window.Request;

let fetchStub: SinonStub | undefined = undefined;

export const getOptions = (callNumber = 0) =>
  (fetchStub?.getCall(callNumber).args[1] || {}) as Parameters<
    typeof window.fetch
  >[1];

export const install = () => {
  fetchStub = sinon.stub(window, 'fetch');
  fetchStub.callsFake(() => Promise.resolve(new Response()));

  return fetchStub;
};

export const restore = () => {
  fetchStub?.restore();
};

export const resetHistory = () => {
  fetchStub?.resetHistory();
};

export const getMethod = (callNumber = 0) => {
  const firstArg = fetchStub?.getCall(callNumber).args[0] as Parameters<
    typeof window.fetch
  >[0];
  if (withRequest(firstArg)) {
    return firstArg.method;
  }
  return getOptions(callNumber)?.method ?? 'get';
};

export const getBody = (callNumber = 0) => {
  const firstArg = fetchStub?.getCall(callNumber).args[0] as Parameters<
    typeof window.fetch
  >[0];
  if (withRequest(firstArg)) {
    return firstArg.body;
  }
  return getOptions(callNumber)?.body ?? '';
};

export const getUrl = (callNumber = 0) => {
  const firstArg = fetchStub?.getCall(callNumber).args[0] as Parameters<
    typeof window.fetch
  >[0];
  if (withRequest(firstArg)) {
    return firstArg.url;
  }
  return firstArg;
};

export const getRequestHeaders = (callNumber = 0) => {
  const firstArg = fetchStub?.getCall(callNumber).args[0] as Parameters<
    typeof window.fetch
  >[0];

  if (withRequest(firstArg)) {
    return firstArg.headers;
  }
  return getOptions(callNumber)?.headers ?? {};
};

export const respondWith = (data: BodyInit | null, options?: ResponseInit) =>
  fetchStub?.returns(Promise.resolve(new Response(data, options)));

export const wasCalled = (callNumber = 0) => !!fetchStub?.getCall(callNumber);
