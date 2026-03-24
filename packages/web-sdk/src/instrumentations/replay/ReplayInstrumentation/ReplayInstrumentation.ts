import { SeverityNumber } from '@opentelemetry/api-logs';
import type { eventWithTime } from 'rrweb';
import { record } from 'rrweb';

import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { ReplayInstrumentationArgs } from './types.ts';

export class ReplayInstrumentation extends EmbraceInstrumentationBase {
  private static readonly FLUSH_INTERVAL_MS = 3_000;
  private static readonly MAX_BUFFER_SIZE = 50;

  private _eventBuffer: eventWithTime[] = [];
  private _flushIntervalId?: ReturnType<typeof setInterval>;
  private _stopRecording?: () => void;

  public constructor({ diag, perf }: ReplayInstrumentationArgs = {}) {
    super({
      instrumentationName: 'ReplayInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    if (this._config.enabled) {
      this.enable();
    } else {
      this._diag.debug('disabled, not starting');
    }
  }

  private _flush(): void {
    if (this._eventBuffer.length === 0) return;
    this._diag.debug('flushing', this._eventBuffer.length, 'events');
    const events = this._eventBuffer;
    this._eventBuffer = [];
    try {
      this.logger.emit({
        eventName: 'replay',
        severityNumber: SeverityNumber.INFO,
        attributes: {
          'emb.type': 'ux.replay',
          'replay.events': JSON.stringify(events),
          'replay.count': events.length,
        },
      });
    } catch (e) {
      this._diag.error('failed to save events', e);
    }
  }

  private readonly _onEvent = (event: eventWithTime) => {
    this._diag.debug('event received', event.type);
    this._eventBuffer.push(event);
    if (this._eventBuffer.length >= ReplayInstrumentation.MAX_BUFFER_SIZE) {
      this._flush();
    }
  };

  public disable(): void {
    if (this._stopRecording) {
      this._diag.debug('stopping recording');
      clearInterval(this._flushIntervalId);
      this._flushIntervalId = undefined;
      this._stopRecording();
      this._stopRecording = undefined;
      this._flush();
    }
  }

  public enable(): void {
    if (this._stopRecording) {
      this._diag.debug('already recording');
      return;
    }

    try {
      this._diag.debug('starting recording');
      const stopFn = record({
        emit: this._onEvent,
        // sampling: {
        //   mousemove: 300,
        //   scroll: 300,
        // },
      });
      if (!stopFn) {
        this._diag.warn('record() returned undefined, did not start');
        return;
      }
      this._stopRecording = stopFn;
      this._flushIntervalId = setInterval(() => {
        this._flush();
      }, ReplayInstrumentation.FLUSH_INTERVAL_MS);
      this._diag.debug('recording started');
    } catch (e) {
      this._diag.error('failed to start recording', e);
    }
  }
}
