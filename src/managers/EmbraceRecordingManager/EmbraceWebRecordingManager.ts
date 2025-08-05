import { record } from 'rrweb';
import type {
  EmbraceRecordingManager,
  EmbraceRecordingManagerArgs,
} from './types.js';
import { diag } from '@opentelemetry/api';
import type { DiagLogger } from '@opentelemetry/api';

export class EmbraceWebRecordingManager implements EmbraceRecordingManager {
  private readonly _diag: DiagLogger;
  private readonly _events: unknown[][] = [];
  private readonly _takeSnapshotEveryNms: number;

  private _stopRecordingHandler?: () => void = undefined;

  public constructor({
    diag: diagParam = diag.createComponentLogger({
      namespace: 'EmbraceWebRecordingManager',
    }),
    takeSnapshotEveryNms = 5000,
  }: EmbraceRecordingManagerArgs) {
    this._diag = diagParam;
    this._takeSnapshotEveryNms = takeSnapshotEveryNms;
  }

  public startRecording(): void {
    this._stopRecordingHandler = record({
      emit: (event, isCheckout) => {
        if (isCheckout) {
          this._events.push([]);
        }

        this._events[this._events.length - 1].push(event);
      },
      checkoutEveryNms: this._takeSnapshotEveryNms,
    });

    this._diag.info('Recording started');
  }

  public stopRecording(): void {
    this._stopRecordingHandler?.();

    this._diag.info('Recording stopped');
  }

  public getRecentEvents() {
    if (this._events.length === 0) {
      return [];
    }

    return this._events[this._events.length - 1];
  }
}
