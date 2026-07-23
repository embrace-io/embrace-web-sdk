import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import * as chai from 'chai';
import { EMB_TYPES, KEY_EMB_TYPE } from '../constants/index.ts';
import { KEY_EMB_SOFT_NAVIGATION_SOURCE } from '../instrumentations/soft-navigation-performance/SoftNavigationPerformanceInstrumentation/constants.ts';
import {
  isNetworkSpan,
  isSessionPartSpan,
  isSoftNavigationSpan,
} from './spanPredicates.ts';

const { expect } = chai;

const fakeSpan = (attributes: Record<string, unknown>): ReadableSpan =>
  ({ attributes }) as unknown as ReadableSpan;

describe('isNetworkSpan', () => {
  it('returns true for a span with method, numeric status, and an absolute url', () => {
    expect(
      isNetworkSpan(
        fakeSpan({
          'http.request.method': 'GET',
          'http.response.status_code': 200,
          'url.full': 'https://example.com',
        }),
      ),
    ).to.be.true;
  });

  it('returns true for a 0 status code', () => {
    expect(
      isNetworkSpan(
        fakeSpan({
          'http.request.method': 'GET',
          'http.response.status_code': 0,
          'url.full': 'https://example.com',
        }),
      ),
    ).to.be.true;
  });

  it('returns false when there is no http method', () => {
    expect(
      isNetworkSpan(
        fakeSpan({
          'http.response.status_code': 200,
          'url.full': 'https://example.com',
        }),
      ),
    ).to.be.false;
  });

  it('returns false when the status code is not numeric', () => {
    expect(
      isNetworkSpan(
        fakeSpan({
          'http.request.method': 'GET',
          'http.response.status_code': 'ok',
          'url.full': 'https://example.com',
        }),
      ),
    ).to.be.false;
  });

  it('returns false when the url is not absolute', () => {
    expect(
      isNetworkSpan(
        fakeSpan({
          'http.request.method': 'GET',
          'http.response.status_code': 200,
          'url.full': '/some/path',
        }),
      ),
    ).to.be.false;
  });

  it('returns false for an unrelated span', () => {
    expect(isNetworkSpan(fakeSpan({ foo: 'bar' }))).to.be.false;
  });
});

describe('isSessionPartSpan', () => {
  it('returns true for a span with emb.type of SessionPart', () => {
    expect(
      isSessionPartSpan(fakeSpan({ [KEY_EMB_TYPE]: EMB_TYPES.SessionPart })),
    ).to.be.true;
  });

  it('returns false for a span with a different emb.type', () => {
    expect(isSessionPartSpan(fakeSpan({ [KEY_EMB_TYPE]: EMB_TYPES.Perf }))).to
      .be.false;
  });

  it('returns false for a span with no emb.type', () => {
    expect(isSessionPartSpan(fakeSpan({}))).to.be.false;
  });
});

describe('isSoftNavigationSpan', () => {
  it('returns true for a span with a soft-navigation source', () => {
    expect(
      isSoftNavigationSpan(
        fakeSpan({ [KEY_EMB_SOFT_NAVIGATION_SOURCE]: 'polyfill' }),
      ),
    ).to.be.true;
  });

  it('returns false for a span without a soft-navigation source', () => {
    expect(isSoftNavigationSpan(fakeSpan({}))).to.be.false;
  });
});
