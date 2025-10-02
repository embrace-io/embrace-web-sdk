import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.js';
import type { EmptyRootInstrumentationArgs } from './types.js';
import type { BodyDocument } from '../../../common/index.js';

/*
  EmptyRootInstrumentation observes changes to what is considered the root node of the application and emits a span
  event on the session span if it ever finds it empty. The root node is either passed in explicitly or attempted to
  be determined heuristically from the document
 */
export class EmptyRootInstrumentation extends EmbraceInstrumentationBase {
  private readonly _observer: MutationObserver;
  private readonly _bodyDoc: BodyDocument;
  private readonly _emptyCheckDelay: number;
  private _rootNode: Node | null = null;

  public constructor({
    diag,
    perf,
    rootNode,
    bodyDoc = window.document,
    emptyCheckDelay = 500,
  }: EmptyRootInstrumentationArgs = {}) {
    super({
      instrumentationName: 'EmptyRootInstrumentation',
      instrumentationVersion: '1.0.0',
      diag,
      perf,
      config: {},
    });
    this._bodyDoc = bodyDoc;
    this._emptyCheckDelay = emptyCheckDelay;

    this._observer = new MutationObserver(
      (mutationList: MutationRecord[], _observer: MutationObserver) => {
        this._observerCallback(mutationList);
      }
    );

    if (rootNode) {
      this._diag.debug('using user supplied root node');
      this._rootNode = rootNode;
    }

    if (this._config.enabled) {
      this.enable();
    }
  }

  public disable(): void {
    this._observer.disconnect();
  }

  public enable(): void {
    this._determineRootNode();

    if (this._rootNode) {
      this._observer.observe(this._rootNode, { childList: true });
    }
  }

  protected _determineRootNode(): void {
    if (this._rootNode) {
      return;
    }

    const bodyChildren = this._bodyDoc.body.children;
    if (bodyChildren.length === 1) {
      this._diag.debug(
        'body had exactly one child, considering this to be the root node'
      );
      this._rootNode = bodyChildren[0];
    } else {
      this._diag.debug(
        'body did not have exactly one child, could not determine root node'
      );
    }
  }

  protected _observerCallback(mutationList: MutationRecord[]): void {
    if (!this._rootNode) {
      return;
    }

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
    if (!this._rootNode?.childNodes.length) {
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
