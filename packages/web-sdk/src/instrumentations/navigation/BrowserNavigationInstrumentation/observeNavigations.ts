import type { DiagLogger } from '@opentelemetry/api';
import type {
  Cleanup,
  DetectionSource,
  NavigateEvent,
  NavigationCallback,
  NavigationType,
  PerformanceWithSoftNavs,
  SoftNavigationEntry,
} from './types.ts';

const DEDUPE_WINDOW_MS = 50;

interface ObserveNavigationsOptions {
  emitHardNavigations?: boolean;
}

export const observeNavigations = (
  callback: NavigationCallback,
  diag: DiagLogger,
  options: ObserveNavigationsOptions = {},
): Cleanup => {
  let currentUrl = location.href;
  let lastEmitUrl = '';
  let lastEmitTimestamp = 0;
  let isEmitting = false;
  const cleanupFns: Array<() => void> = [];

  const isDuplicate = (url: string, timestamp: number): boolean => {
    return (
      url === lastEmitUrl &&
      Math.abs(timestamp - lastEmitTimestamp) <= DEDUPE_WINDOW_MS
    );
  };

  const emit = (
    type: NavigationType,
    url: string,
    source: DetectionSource,
  ): void => {
    if (isEmitting) {
      diag.debug(`Ignoring re-entrant navigation event: ${source} -> ${url}`);
      return;
    }

    const timestamp = Date.now();

    if (isDuplicate(url, timestamp)) {
      diag.debug(`Deduplicating navigation event: ${source} -> ${url}`);
      return;
    }

    isEmitting = true;

    try {
      const previousUrl = currentUrl;
      currentUrl = url;
      lastEmitUrl = url;
      lastEmitTimestamp = timestamp;

      callback({
        type,
        url,
        previousUrl,
        timestamp,
        source,
      });
    } catch (e) {
      diag.error(
        `Error in navigation callback: source=${source}, url=${url}`,
        e,
      );
    } finally {
      isEmitting = false;
    }
  };

  // Layer 0: PerformanceNavigationTiming — initial page load type
  try {
    const [navEntry] = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];

    if (navEntry) {
      const typeMap: Record<string, NavigationType> = {
        navigate: 'hard_navigation',
        reload: 'reload',
        back_forward: 'back_forward',
        prerender: 'prerender_activation',
      };
      const navType = typeMap[navEntry.type];

      if (
        navType &&
        (navType !== 'hard_navigation' || options.emitHardNavigations)
      ) {
        diag.debug(
          `Layer 0: PerformanceNavigationTiming type=${navEntry.type}, emitting as ${navType}`,
        );
        emit(navType, location.href, 'perf_timing');
      } else {
        diag.debug(
          `Layer 0: PerformanceNavigationTiming type=${navEntry.type}, skipped (emitHardNavigations=${options.emitHardNavigations ?? false})`,
        );
      }
    }
  } catch (e) {
    diag.error('Failed to read PerformanceNavigationTiming', e);
  }

  // Layer 1: Soft Navigation API (experimental, Chrome only)
  try {
    const perf = performance as PerformanceWithSoftNavs;

    if (
      perf.softNavs !== undefined ||
      PerformanceObserver.supportedEntryTypes?.includes('soft-navigation')
    ) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as SoftNavigationEntry[]) {
          const url = entry.name || location.href;
          diag.debug(`Layer 1: Soft navigation entry observed, url=${url}`);
          emit('soft_navigation', url, 'soft_nav_api');
        }
      });

      observer.observe({ type: 'soft-navigation', buffered: true });
      diag.debug('Layer 1: Soft Navigation API observer active');
      cleanupFns.push(() => {
        observer.disconnect();
      });
    }
  } catch (e) {
    diag.warn('Layer 1: Soft Navigation API not available', e);
  }

  // Layer 2 (Navigation API) and Layer 3 (history patch) are mutually exclusive —
  // both observe the same underlying same-document navigations, so enabling both would produce duplicates
  const win = window;
  const hasNavigationAPI =
    win.navigation !== undefined &&
    typeof win.navigation.addEventListener === 'function';

  if (hasNavigationAPI) {
    // Layer 2: Navigation API — same-document navigations
    diag.debug('Layer 2: Navigation API detected, using navigatesuccess');
    try {
      const navigation = win.navigation;

      if (navigation) {
        let pendingUrl: string | null = null;
        let pendingType: NavigationType = 'spa_navigation';

        /* eslint-disable baseline-js/use-baseline -- Navigation API is used as progressive enhancement behind runtime feature detection */
        const onNavigate = (event: NavigateEvent) => {
          if (!event.destination.sameDocument) {
            diag.debug(
              `Layer 2: Cross-document navigation, deferring to browser (url=${event.destination.url})`,
            );
            return;
          }

          pendingUrl = event.destination.url;

          const typeMap: Record<
            NavigateEvent['navigationType'],
            NavigationType
          > = {
            push: 'spa_navigation',
            replace: 'spa_navigation',
            traverse: 'back_forward',
            reload: 'reload',
          };
          pendingType = typeMap[event.navigationType] ?? 'spa_navigation';
          diag.debug(
            `Layer 2: navigate event, navigationType=${event.navigationType}, destination=${pendingUrl}`,
          );
        };
        /* eslint-enable baseline-js/use-baseline */

        const onNavigateSuccess = () => {
          if (pendingUrl) {
            emit(pendingType, pendingUrl, 'navigation_api');
            pendingUrl = null;
          }
        };

        const onNavigateError = () => {
          diag.debug(
            `Layer 2: navigateerror, discarding pending url=${pendingUrl}`,
          );
          pendingUrl = null;
        };

        navigation.addEventListener('navigate', onNavigate);
        navigation.addEventListener('navigatesuccess', onNavigateSuccess);
        navigation.addEventListener('navigateerror', onNavigateError);

        cleanupFns.push(() => {
          navigation.removeEventListener('navigate', onNavigate);
          navigation.removeEventListener('navigatesuccess', onNavigateSuccess);
          navigation.removeEventListener('navigateerror', onNavigateError);
        });
      }
    } catch (e) {
      diag.error('Failed to setup Navigation API listener', e);
    }
  } else {
    // Layer 3: history.pushState/replaceState patch + popstate
    diag.debug(
      'Layer 3: Navigation API absent, patching history.pushState/replaceState',
    );
    try {
      const originalPushState = history.pushState.bind(history);
      const originalReplaceState = history.replaceState.bind(history);

      history.pushState = (
        data: Parameters<typeof history.pushState>[0],
        unused: string,
        url?: string | URL | null,
      ) => {
        originalPushState(data, unused, url);
        try {
          const resolvedUrl = url
            ? new URL(String(url), location.href).href
            : location.href;
          emit('spa_navigation', resolvedUrl, 'history_patch');
        } catch (e) {
          diag.error('Failed to resolve URL from pushState', e);
        }
      };

      history.replaceState = (
        data: Parameters<typeof history.replaceState>[0],
        unused: string,
        url?: string | URL | null,
      ) => {
        originalReplaceState(data, unused, url);
        try {
          const resolvedUrl = url
            ? new URL(String(url), location.href).href
            : location.href;
          emit('spa_navigation', resolvedUrl, 'history_patch');
        } catch (e) {
          diag.error('Failed to resolve URL from replaceState', e);
        }
      };

      const onPopState = () => {
        emit('back_forward', location.href, 'popstate');
      };

      window.addEventListener('popstate', onPopState);

      cleanupFns.push(() => {
        history.pushState = originalPushState;
        history.replaceState = originalReplaceState;
        window.removeEventListener('popstate', onPopState);
      });
    } catch (e) {
      diag.error('Failed to patch history API', e);
    }
  }

  // Layer 4: hashchange — always active with dedup
  diag.debug('Layer 4: hashchange listener active');
  try {
    const onHashChange = () => {
      emit('hash_change', location.href, 'hashchange');
    };

    window.addEventListener('hashchange', onHashChange);
    cleanupFns.push(() => {
      window.removeEventListener('hashchange', onHashChange);
    });
  } catch (e) {
    diag.error('Failed to setup hashchange listener', e);
  }

  return () => {
    for (const cleanup of cleanupFns) {
      try {
        cleanup();
      } catch (e) {
        diag.error('Error during navigation observation cleanup', e);
      }
    }
  };
};
