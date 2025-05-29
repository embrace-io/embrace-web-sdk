import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import type {
  NavigationAction,
  NavigationEvent,
  NavigationInstrumentationArgs,
} from './types.js';

export class NavigationInstrumentation extends EmbraceInstrumentationBase {
  constructor({ diag }: NavigationInstrumentationArgs) {
    super({
      instrumentationName: 'NavigationInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      config: {},
    });
  }

  public emitNavigationEvent(
    event: NavigationEvent,
    action: NavigationAction
  ) {}

  enable(): void {}

  disable(): void {}
}
