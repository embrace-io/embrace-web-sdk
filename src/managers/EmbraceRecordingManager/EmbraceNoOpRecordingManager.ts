import type { EmbraceRecordingManager } from './types.js';

export class EmbraceNoOpRecordingManager implements EmbraceRecordingManager {
  public startRecording(): void {}

  public stopRecording(): void {}

  public getRecentEvents() {
    return [];
  }
}
