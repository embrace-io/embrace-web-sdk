import { diag } from '@opentelemetry/api';
import { createSafeProxy } from '../../../utils/index.js';
import type { PageManager } from '../../manager/index.js';
import { NoOpPageManager, ProxyPageManager } from '../../manager/index.js';

/**
 * Public interface for PageAPI including SDK-internal methods.
 */
export interface PageAPIInstance extends PageManager {
  /** @internal SDK use only */
  setGlobalPageManager(pageManager: PageManager): void;
  /** @internal SDK use only */
  getPageManager(): PageManager;
}

const NOOP_PAGE_MANAGER = new NoOpPageManager();
const INTERNAL_METHODS = new Set(['setDelegate', 'getDelegate']);

export class PageAPI {
  private static _instance?: PageAPIInstance;

  public static getInstance(): PageAPIInstance {
    if (!PageAPI._instance) {
      const proxyManager = new ProxyPageManager();

      const safeManager = createSafeProxy(
        proxyManager,
        NOOP_PAGE_MANAGER,
        diag.createComponentLogger({ namespace: 'PageAPI' }),
        INTERNAL_METHODS,
      );

      PageAPI._instance = Object.assign(safeManager, {
        setGlobalPageManager(pageManager: PageManager): void {
          proxyManager.setDelegate(pageManager);
        },
        getPageManager(): PageManager {
          return proxyManager;
        },
      }) as PageAPIInstance;
    }

    return PageAPI._instance;
  }

  public static resetInstance(): void {
    PageAPI._instance = undefined;
  }
}
