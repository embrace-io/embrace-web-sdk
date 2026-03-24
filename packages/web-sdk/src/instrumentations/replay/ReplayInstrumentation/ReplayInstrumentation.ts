import { SeverityNumber } from '@opentelemetry/api-logs';
import type { eventWithTime } from 'rrweb';
import { record } from 'rrweb';

import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { ReplayInstrumentationArgs } from './types.ts';

export class ReplayInstrumentation extends EmbraceInstrumentationBase {
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

  private readonly _onEvent = (event: eventWithTime) => {
    this._diag.debug('event received', event.type);
    try {
      this.logger.emit({
        eventName: 'replay',
        severityNumber: SeverityNumber.INFO,
        attributes: {
          'emb.type': 'ux.replay',
          'replay.event': JSON.stringify(event),
        },
      });
    } catch (e) {
      this._diag.error('failed to save event', e);
    }
  };

  public disable(): void {
    if (this._stopRecording) {
      this._diag.debug('stopping recording');
      this._stopRecording();
      this._stopRecording = undefined;
    }
  }

  public enable(): void {
    if (this._stopRecording) {
      this._diag.debug('already recording');
      return;
    }

    try {
      this._diag.debug('starting recording');
      const stopFn = record({ emit: this._onEvent });
      if (!stopFn) {
        this._diag.warn('record() returned undefined, did not start');
        return;
      }
      this._stopRecording = stopFn;
      this._diag.debug('recording started');
    } catch (e) {
      this._diag.error('failed to start recording', e);
    }
  }
}
