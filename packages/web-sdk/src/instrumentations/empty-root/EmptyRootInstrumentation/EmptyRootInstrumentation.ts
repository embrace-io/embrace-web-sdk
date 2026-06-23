import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { EmptyRootInstrumentationArgs } from './types.ts';

/*
  EmptyRootInstrumentation observes changes to what is considered the root node of the application and emits a span
  event on the session part span if it ever finds it empty.
 */
export class EmptyRootInstrumentation extends EmbraceInstrumentationBase {
  private readonly _observer: MutationObserver;
  private readonly _emptyCheckDelayMs: number;
  private readonly _rootNode: Node | null;

  public constructor({
    diag,
    perf,
    rootNode,
    emptyCheckDelayMs = 500,
  }: EmptyRootInstrumentationArgs) {
    super({
      instrumentationName: 'EmptyRootInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._rootNode = rootNode;
    this._emptyCheckDelayMs = emptyCheckDelayMs;

    this._observer = new MutationObserver(
      (mutationList: MutationRecord[], _observer: MutationObserver) => {
        this._observerCallback(mutationList);
      },
    );

    if (this._config.enabled) {
      this.enable();
    }
  }

  public override enable(): void {
    if (this._rootNode) {
      super.enable();
    } else {
      this._diag.warn(
        "supplied root node was null, this instrumentation won't be enabled",
      );
    }
  }

  public override onDisable(): void {
    this._observer.disconnect();
  }

  public override onEnable(): void {
    if (this._rootNode) {
      this._observer.observe(this._rootNode, { childList: true });
    }
  }

  protected _observerCallback(mutationList: MutationRecord[]): void {
    let removedNodesFromRoot = false;
    let addedNodesToRoot = false;

    for (const mutation of mutationList) {
      if (mutation.target === this._rootNode) {
        if (mutation.removedNodes.length > 0) {
          removedNodesFromRoot = true;
        }

        if (mutation.addedNodes.length > 0) {
          addedNodesToRoot = true;
        }
      }
    }

    if (removedNodesFromRoot && !addedNodesToRoot) {
      this._diag.debug(
        'root node had child nodes removed without new ones being added, ' +
          `checking if it's empty in ${this._emptyCheckDelayMs}ms`,
      );

      window.setTimeout(() => {
        this._checkForEmptyRootNode();
      }, this._emptyCheckDelayMs);
    }
  }

  protected _checkForEmptyRootNode(): void {
    if (this._rootNode?.childNodes.length === 0) {
      this._diag.debug('root node was found to be empty');

      const currentSessionPartSpan =
        this.userSessionManager.getSessionPartSpan();
      if (currentSessionPartSpan) {
        currentSessionPartSpan.addEvent('empty-root-node', {
          'emb.type': 'ux.empty_root_node',
        });
      } else {
        this._diag.debug('no active session found to emit event on');
      }
    }
  }
}
