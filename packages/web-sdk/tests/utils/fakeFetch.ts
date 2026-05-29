import type { SinonStub } from 'sinon';
import * as sinon from 'sinon';

// TODO this helper file could be open sourced as a separate package

const withRequest = (arg: unknown) => arg instanceof window.Request;

// Embrace endpoints by path: spans and logs are separate telemetry exports, and
// remote config is its own fetch. Config fetches interleave with telemetry on
// the same stub, so tests must address a call by its endpoint rather than by its
// absolute position in the fetch history.
const SPANS_PATH = '/v2/spans';
const CONFIG_PATH = '/v2/config';

let fetchStub: SinonStub | undefined;

const callUrl = (callNumber: number): string | undefined => {
  const firstArg = fetchStub?.getCall(callNumber)?.args[0] as
    | Parameters<typeof window.fetch>[0]
    | undefined;
  if (firstArg === undefined) {
    return undefined;
  }
  return withRequest(firstArg) ? firstArg.url : (firstArg as string);
};

// Absolute fetch-call index of the Nth call whose URL hits `path`. Returns -1
// when there is no such call, so callers fail with a clear out-of-range read
// rather than silently addressing the wrong endpoint.
const nthCallToPath = (path: string, n: number) => {
  const total = fetchStub?.callCount ?? 0;
  let seen = 0;
  for (let i = 0; i < total; i++) {
    if (callUrl(i)?.includes(path)) {
      if (seen === n) {
        return i;
      }
      seen++;
    }
  }
  return -1;
};

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

export const fakeFetchGetKeepalive = (callNumber = 0) =>
  fakeFetchGetOptions(callNumber)?.keepalive;

export const fakeFetchWasCalled = (callNumber = 0) =>
  !!fetchStub?.getCall(callNumber);

// Endpoint-addressed reads. Config fetches and telemetry exports share the fetch
// stub, so tests ask for "the Nth spans export" or "the Nth config fetch" by
// endpoint instead of by absolute fetch position.

export const fakeFetchGetSpansBody = (spansExportNumber = 0) =>
  fakeFetchGetBody(nthCallToPath(SPANS_PATH, spansExportNumber));

export const fakeFetchGetSpansRequestHeaders = (spansExportNumber = 0) =>
  fakeFetchGetRequestHeaders(nthCallToPath(SPANS_PATH, spansExportNumber));

export const fakeFetchGetConfigUrl = (configCallNumber = 0) =>
  fakeFetchGetUrl(nthCallToPath(CONFIG_PATH, configCallNumber));
