import { millisToHrTime, otperformance } from '@opentelemetry/core';

export const getNowHRTime = () => millisToHrTime(getNowMillis());

export const epochMillisFromOriginOffset = (originOffset: number) =>
  otperformance.timeOrigin + originOffset;

export const getNowMillis = () =>
  epochMillisFromOriginOffset(otperformance.now()); // otperformance.now() returns milliseconds since timeOrigin, timeOrigin is the time from epoch to the start of the page load
