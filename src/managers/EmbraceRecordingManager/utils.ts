import type { EmbraceRecordingManagerArgs } from './types.js';
import { EmbraceWebRecordingManager } from './EmbraceWebRecordingManager.js';

export const createEmbraceWebRecordingManager = (
  args: EmbraceRecordingManagerArgs = {}
) => new EmbraceWebRecordingManager(args);
