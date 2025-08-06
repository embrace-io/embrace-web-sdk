import { record } from 'rrweb';
import type { eventWithTime } from 'rrweb';
import { pack } from '@rrweb/packer';

import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import type { ReplayInstrumentationArgs } from './types.js';

export class ReplayInstrumentation extends EmbraceInstrumentationBase {
  private readonly _compress: boolean;
  private _stopRecording?: () => void;

  public constructor({
    diag,
    perf,
    compress = true,
  }: ReplayInstrumentationArgs = {}) {
    super({
      instrumentationName: 'ReplayInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._compress = compress;

    if (this._config.enabled) {
      this.enable();
    }
  }

  private readonly _onEvent = (event: eventWithTime) => {
    const sessionSpan = this.sessionManager.getSessionSpan();

    if (!sessionSpan) {
      this._diag.debug('Replay event dropped: no active session');
      return;
    }

    try {
      sessionSpan.addEvent('replay', {
        'emb.type': 'ux.replay',
        'replay.data': JSON.stringify({ events: [event] }),
        'replay.compressed': this._compress,
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
      this._stopRecording = record({
        emit: this._onEvent,
        packFn: this._compress ? pack : undefined,
      });
    } catch (e) {
      this._diag.error('failed to start recording', e);
    }
  }
}
