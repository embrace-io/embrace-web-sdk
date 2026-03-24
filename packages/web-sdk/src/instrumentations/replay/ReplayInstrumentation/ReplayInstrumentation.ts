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
    }
  }

  private readonly _onEvent = (event: eventWithTime) => {
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
      this._diag.error('failed to save replay event', e);
    }
  };

  public disable(): void {
    if (this._stopRecording) {
      this._stopRecording();
      this._stopRecording = undefined;
    }
  }

  public enable(): void {
    if (this._stopRecording) return;

    try {
      const stopFn = record({ emit: this._onEvent });
      if (!stopFn) {
        this._diag.warn('record() returned undefined, recording did not start');
        return;
      }
      this._stopRecording = stopFn;
    } catch (e) {
      this._diag.error('failed to start recording', e);
    }
  }
}
