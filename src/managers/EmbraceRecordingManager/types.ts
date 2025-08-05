import type { DiagLogger } from '@opentelemetry/api';

export interface EmbraceRecordingManager<Events = unknown> {
  startRecording: () => void;
  stopRecording: () => void;
  getRecentEvents: () => Events[];
}

export interface EmbraceRecordingManagerArgs {
  diag: DiagLogger;

  /**
   * Defines the interval in milliseconds at which a snapshot of the recording is taken.
   * When getting the recent events, it will return the events from the last snapshot.
   */
  takeSnapshotEveryNms?: number;
}
