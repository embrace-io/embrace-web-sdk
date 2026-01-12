import type { SinonStub } from 'sinon';
import * as sinon from 'sinon';

// TODO this helper file could be open sourced as a separate package

const withRequest = (arg: unknown) => arg instanceof window.Request;

let fetchStub: SinonStub | undefined;

export const fakeFetchGetOptions = (callNumber = 0) =>
  (fetchStub?.getCall(callNumber).args[1] || {}) as Parameters<
    typeof window.fetch
  >[1];

export const fakeFetchInstall = () => {
  fetchStub = sinon.stub(window, 'fetch');
  fetchStub.callsFake(() => Promise.resolve(new Response()));

  return fetchStub;
};

export const fakeFetchRestore = () => {
  fetchStub?.restore();
};

export const fakeFetchResetHistory = () => {
  fetchStub?.resetHistory();
};

export const fakeFetchGetMethod = (callNumber = 0) => {
  const firstArg = fetchStub?.getCall(callNumber).args[0] as Parameters<
    typeof window.fetch
  >[0];
  if (withRequest(firstArg)) {
    return firstArg.method;
  }
  return fakeFetchGetOptions(callNumber)?.method ?? 'get';
};

export const fakeFetchGetBody = (callNumber = 0) => {
  const firstArg = fetchStub?.getCall(callNumber).args[0] as Parameters<
    typeof window.fetch
  >[0];
  if (withRequest(firstArg)) {
    return firstArg.body;
  }
  return fakeFetchGetOptions(callNumber)?.body ?? '';
};

export const fakeFetchGetUrl = (callNumber = 0) => {
  const firstArg = fetchStub?.getCall(callNumber).args[0] as Parameters<
    typeof window.fetch
  >[0];
  if (withRequest(firstArg)) {
    return firstArg.url;
  }
  return firstArg;
};

export const fakeFetchGetRequestHeaders = (callNumber = 0) => {
  const firstArg = fetchStub?.getCall(callNumber).args[0] as Parameters<
    typeof window.fetch
  >[0];

  if (withRequest(firstArg)) {
    return firstArg.headers;
  }
  return fakeFetchGetOptions(callNumber)?.headers ?? {};
};

export const fakeFetchRespondWith = (
  data: BodyInit | null,
  options?: ResponseInit,
) => fetchStub?.callsFake(() => Promise.resolve(new Response(data, options)));

export const fakeFetchWasCalled = (callNumber = 0) =>
  !!fetchStub?.getCall(callNumber);
