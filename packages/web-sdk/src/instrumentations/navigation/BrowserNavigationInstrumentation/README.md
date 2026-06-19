# BrowserNavigationInstrumentation

Automatic route detection for single-page and multi-page web applications. Detects navigations through browser API observation, emits log events with navigation metadata, and updates the SDK's page context so that subsequent telemetry is tagged with the active route.

## Usage

This instrumentation is **opt-in** — it must be explicitly listed in `defaultInstrumentationConfig` to activate.

```typescript
import { initSDK } from '@embrace-io/web-sdk';

initSDK({
  defaultInstrumentationConfig: {
    'browser-navigation': {
      routeMatcher: (url: string) => {
        const pathname = new URL(url, location.href).pathname;
        return pathname.replace(/\/products\/\d+/, '/products/:id');
      },
    },
  },
});
```

Pass `{}` to enable with defaults (pathname extracted from the URL).

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `routeMatcher` | `(url: string) => string` | pathname extracted from URL | Transforms a full URL into a route path for low-cardinality grouping. |
| `emitHardNavigations` | `boolean` | `false` | Emit a `hard_navigation` event for the initial page load. |
| `enabled` | `boolean` | `true` | Enables or disables the instrumentation. |
| `diag` | `DiagLogger` | SDK default | Custom diagnostic logger. |

## Heuristic Validation

When `enableHeuristicValidation` is `true`, SPA navigations (Layers 2-4) are validated using ambient browser signals before emitting. Layer 1 soft navigations are already browser-validated and bypass heuristic checks. This helps distinguish real page transitions from cosmetic URL changes (e.g. query param updates, modals).

```typescript
initSDK({
  defaultInstrumentationConfig: {
    'browser-navigation': {
      enableHeuristicValidation: true,
      minimumConfidence: 'medium',
      domScoreThreshold: 15,
    },
  },
});
```

### Heuristic Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableHeuristicValidation` | `boolean` | `false` | Enable multi-signal validation for SPA navigations. |
| `interactionWindow` | `number` | `5000` | How far back (ms) to look for a user interaction to attribute. |
| `domSettleDelay` | `number` | `200` | Time (ms) after the last DOM mutation before considering the page settled. |
| `maxSettleDelay` | `number` | `3000` | Maximum time (ms) to wait for DOM to settle, even with continuous mutations. |
| `domScoreThreshold` | `number` | `15` | DOM mutation score required for `high` confidence. |
| `allowWithoutInteraction` | `boolean` | `false` | Emit navigations that have no attributed user interaction. When `false`, navigations without interaction are still emitted if confidence is `high` or `very-high`. |
| `minimumConfidence` | `Confidence` | `'medium'` | Minimum confidence level required to emit a navigation log. |

### Signals Collected

- **DOM mutations**: Scored by element type (e.g. `<article>` = 3, `<div>` = 1), including all descendant elements of added nodes. Higher scores indicate more substantial page changes.
- **Title changes**: `document.title` changing after a URL change.
- **User interaction**: Click, keydown, or form submit within the `interactionWindow` before the URL change.
- **Network requests**: Count of resource fetches after the URL change.
- **Scroll reset**: Whether `window.scrollY` returned to 0.

### Confidence Levels

| Level | Criteria |
|-------|----------|
| `very-high` | DOM score exceeds threshold AND title changed |
| `high` | DOM score exceeds threshold |
| `medium-high` | Title changed |
| `medium` | User interaction attributed |
| `low` | None of the above |

## Emitted Log Attributes

Each navigation emits a log event with:

| Attribute | Value |
|-----------|-------|
| `emb.type` | `browser.navigation` |
| `emb.navigation.type` | `hard_navigation`, `soft_navigation` (Chrome Soft Navigation API), `spa_navigation` (history-based SPA transitions), `back_forward`, `reload`, `hash_change`, or `prerender_activation` |
| `emb.navigation.detection_source` | `perf_timing`, `soft_nav_api`, `navigation_api`, `history_patch`, `popstate`, or `hashchange` |
| `emb.referrer_url` | URL before navigation |
| `app.surface.name` | Resolved route path |

When `enableHeuristicValidation` is `true` and the navigation source is a SPA layer (2-4):

| Attribute | Value |
|-----------|-------|
| `emb.navigation.confidence` | `very-high`, `high`, `medium-high`, `medium`, or `low` |
| `emb.navigation.dom_score` | Numeric DOM mutation score (as string) |
| `emb.navigation.title_changed` | `'true'` or `'false'` |
| `emb.navigation.interaction_type` | `'click'`, `'keydown'`, or `'submit'` (absent if none) |
| `emb.navigation.interaction_latency_ms` | Milliseconds from interaction to navigation (as string, absent if none) |
| `emb.navigation.network_requests` | Count of resource fetches (as string) |
| `emb.navigation.scroll_reset` | `'true'` or `'false'` |

## Relationship to NavigationInstrumentation

`NavigationInstrumentation` is the manual/framework-based counterpart (React Router, etc.). It receives route updates from the framework rather than detecting them from browser APIs.

Use **one or the other** — enabling both produces conflicting page context updates. Use `BrowserNavigationInstrumentation` for framework-agnostic automatic detection. Use `NavigationInstrumentation` when your framework provides structured route information.
