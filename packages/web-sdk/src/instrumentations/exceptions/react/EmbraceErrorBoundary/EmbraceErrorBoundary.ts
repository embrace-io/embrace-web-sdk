import type { PropsWithChildren } from 'react';
import * as React from 'react';
import { log } from '../../../../api-logs/logAPI.ts';
import type { LogManager } from '../../../../api-logs/manager/types.ts';
import {
  EMB_ERROR_INSTRUMENTATIONS,
  KEY_EMB_INSTRUMENTATION,
} from '../../../../constants/attributes.ts';

type EmbraceErrorBoundaryProps = {
  fallback: () => React.ReactNode;
};

type EmbraceErrorBoundaryState = {
  hasError: boolean;
};

export class EmbraceErrorBoundary<
  P extends PropsWithChildren<EmbraceErrorBoundaryProps>,
> extends React.Component<P, EmbraceErrorBoundaryState> {
  private readonly _logManager: LogManager;

  public constructor(props: P) {
    super(props);

    this._logManager = log.getLogManager();
    this.state = {
      hasError: false,
    };
  }

  public static getDerivedStateFromError() {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this._logManager.logException(error, {
      handled: false,
      attributes: {
        'react.component_stack': errorInfo.componentStack ?? undefined,
        [KEY_EMB_INSTRUMENTATION]:
          EMB_ERROR_INSTRUMENTATIONS.ReactErrorBoundary,
      },
    });
  }

  public override render() {
    if (this.state.hasError) {
      return this.props.fallback();
    }

    return this.props.children;
  }
}
