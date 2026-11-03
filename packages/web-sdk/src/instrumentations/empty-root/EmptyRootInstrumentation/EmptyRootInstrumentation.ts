import type { TimeoutRef } from '../../../utils/index.ts';
import { EmbraceInstrumentationBase } from '../../EmbraceInstrumentationBase/index.ts';
import type { EmptyRootInstrumentationArgs } from './types.ts';

/** Adds an event to the active session part span when the application's root node becomes empty. */
export class EmptyRootInstrumentation extends EmbraceInstrumentationBase {
  private _observer: MutationObserver | null = null;
  private readonly _emptyCheckDelayMs: number;
  private readonly _rootNode: Node | null;
  private readonly _pendingEmptyChecks = new Set<TimeoutRef>();

  public constructor({
    perf,
    rootNode,
    emptyCheckDelayMs = 500,
  }: EmptyRootInstrumentationArgs) {
    super({
      instrumentationName: 'EmptyRootInstrumentation',
      instrumentationVersion: '1.0.0',
      perf,
      config: {},
    });

    this._rootNode = rootNode;
    this._emptyCheckDelayMs = emptyCheckDelayMs;
  }

  protected override _init(): void {
    if (!this._rootNode) {
      throw new Error('rootNode is null');
    }
    this._observer = new MutationObserver((mutationList: MutationRecord[]) => {
      this._observerCallback(mutationList);
    });
  }

  protected override _onDisable(): void {
    this._observer?.disconnect();
    for (const timeoutId of this._pendingEmptyChecks) {
      clearTimeout(timeoutId);
    }
    this._pendingEmptyChecks.clear();
  }

  protected override _onEnable(): void {
    // Only narrows types: _init() has already thrown when either is missing.
    if (this._observer && this._rootNode) {
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

      const timeoutId = setTimeout(() => {
        this._pendingEmptyChecks.delete(timeoutId);
        this._checkForEmptyRootNode();
      }, this._emptyCheckDelayMs);
      this._pendingEmptyChecks.add(timeoutId);
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
