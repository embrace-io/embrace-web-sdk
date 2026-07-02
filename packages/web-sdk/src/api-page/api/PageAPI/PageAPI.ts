import { diag } from '@opentelemetry/api';
import { createSafeProxy } from '../../../utils/createSafeProxy/createSafeProxy.ts';
import { NoOpPageManager } from '../../manager/NoOpPageManager/NoOpPageManager.ts';
import { ProxyPageManager } from '../../manager/ProxyPageManager/ProxyPageManager.ts';
import type { PageManager } from '../../manager/types.ts';

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
