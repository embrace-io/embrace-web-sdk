/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Copied from https://github.com/open-telemetry/opentelemetry-browser/blob/4c2e48d4bb8dd769a31f6109ef0936f9b321bd07/packages/instrumentation/src/utils/toError.ts
// with its `describe` helper named `toMessage`, so it does not shadow the test runner's `describe`.

/**
 * Normalizes any thrown value to an `Error`, keeping a non-Error value as
 * `cause`. Never throws, because a throw here would replace the error we are
 * trying to report.
 */
export function toError(value: unknown): Error {
  try {
    if (value instanceof Error) {
      return value;
    }
    return new Error(toMessage(value), { cause: value });
  } catch {
    // A revoked Proxy throws on `instanceof` and on both conversions below.
    return new Error('thrown value could not be described', { cause: value });
  }
}

function toMessage(value: unknown): string {
  try {
    return String(value);
  } catch {
    // `String()` throws on values like `Object.create(null)`.
    return Object.prototype.toString.call(value);
  }
}
