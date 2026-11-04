/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Ported to Mocha and Chai from https://github.com/open-telemetry/opentelemetry-browser/blob/d42e5e3978c770cab7c3474784275b92dbed1890/packages/api/src/utils/toError.test.ts

import * as chai from 'chai';
import { toError } from './toError.ts';

const { expect } = chai;

describe('toError', () => {
  it('returns an Error unchanged', () => {
    const error = new TypeError('bad');

    expect(toError(error)).to.equal(error);
  });

  it('wraps a primitive and keeps it as the cause', () => {
    const error = toError(42);

    expect(error.message).to.equal('42');
    expect(error.cause).to.equal(42);
  });

  it('wraps a value String() cannot convert', () => {
    const value = Object.create(null);

    const error = toError(value);

    expect(error.message).to.equal('[object Object]');
    expect(error.cause).to.equal(value);
  });

  it('does not throw for a revoked Proxy', () => {
    // `instanceof` and both string conversions throw on a revoked Proxy.
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    const error = toError(proxy);

    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('thrown value could not be described');
    expect(error.cause).to.equal(proxy);
  });

  for (const value of [null, undefined]) {
    it(`wraps ${String(value)} and keeps it as the cause`, () => {
      const error = toError(value);

      expect(error.message).to.equal(String(value));
      expect(error.cause).to.equal(value);
    });
  }

  it('wraps an object whose toString throws', () => {
    const value = {
      toString() {
        throw new Error('no');
      },
    };

    const error = toError(value);

    expect(error.message).to.equal('[object Object]');
    expect(error.cause).to.equal(value);
  });
});
