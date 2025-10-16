import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import type { EmptyRootInstrumentationArgs } from './types.js';

/*
  EmptyRootInstrumentation observes changes to what is considered the root node of the application and emits a span
  event on the session span if it ever finds it empty.
 */
export class EmptyRootInstrumentation extends EmbraceInstrumentationBase {
  private readonly _observer: MutationObserver;
  private readonly _emptyCheckDelay: number;
  private readonly _rootNode: Node;

  public constructor({
    diag,
    perf,
    rootNode,
    emptyCheckDelay = 500,
  }: EmptyRootInstrumentationArgs) {
    super({
      instrumentationName: 'EmptyRootInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });

    this._rootNode = rootNode;
    this._emptyCheckDelay = emptyCheckDelay;

    this._observer = new MutationObserver(
      (mutationList: MutationRecord[], _observer: MutationObserver) => {
        this._observerCallback(mutationList);
      }
    );

    if (this._config.enabled) {
      this.enable();
    }
  }

  public disable(): void {
    this._observer.disconnect();
  }

  public enable(): void {
    this._observer.observe(this._rootNode, { childList: true });
  }

  protected _observerCallback(mutationList: MutationRecord[]): void {
    let removedNodesFromRoot = false;
    let addedNodesToRoot = false;

    for (const mutation of mutationList) {
      if (mutation.target === this._rootNode) {
        if (mutation.removedNodes.length) {
          removedNodesFromRoot = true;
        }

        if (mutation.addedNodes.length) {
          addedNodesToRoot = true;
        }
      }
    }

    if (removedNodesFromRoot && !addedNodesToRoot) {
      this._diag.debug(
        'root node had child nodes removed without new ones being added, ' +
          `checking if it's empty in ${this._emptyCheckDelay}ms`
      );

      window.setTimeout(() => {
        this._checkForEmptyRootNode();
      }, this._emptyCheckDelay);
    }
  }

  protected _checkForEmptyRootNode(): void {
    if (!this._rootNode.childNodes.length) {
      this._diag.debug('root node was found to be empty');

      const currentSessionSpan = this.sessionManager.getSessionSpan();
      if (currentSessionSpan) {
        currentSessionSpan.addEvent('empty-root-node', {
          'emb.type': 'empty-root-node',
        });
      } else {
        this._diag.debug('no active session found to emit event on');
      }
    }
  }
}
