import { millisToHrTime, otperformance } from '@opentelemetry/core';

export const getNowHRTime = () =>
  millisToHrTime(otperformance.now() + otperformance.timeOrigin); // otperformance.now() returns milliseconds since timeOrigin, timeOrigin is the time from epoch to the start of the page load
