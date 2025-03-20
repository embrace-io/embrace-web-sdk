import { millisToHrTime, otperformance } from '@opentelemetry/core';
import type { PerformanceManager } from './types.js';

export class OTelPerformanceManager implements PerformanceManager {
  public epochMillisFromOriginOffset = (originOffset: number) =>
    otperformance.timeOrigin + originOffset;

  public getNowHRTime = () => millisToHrTime(this.getNowMillis());

  public getNowMillis = () =>
    this.epochMillisFromOriginOffset(otperformance.now()); // otperformance.now() returns milliseconds since timeOrigin, timeOrigin is the time from epoch to the start of the page load
}
