# Instrumenting a React app with the Embrace Web SDK

You can use any of the Embrace Web SDK features in your React application. However, we provide some additional automatic 
instrumentation to make it easier to instrument some common React libraries and patterns.

> [!TIP]
> Make sure you call `initSDK` before your React App is mounted, this will ensure that the SDK is ready to capture traces and logs from the start of your app's lifecycle.

## Route tracking

Navigation is captured out of the box, so no React Router specific wiring is needed. To get low-cardinality page paths (e.g. `/order/:id` instead of `/order/123`), pass your route templates to `initSDK`:

```typescript
import { initSDK } from '@embrace-io/web-sdk';

initSDK({
  // ...Other configs
  routes: ['/', '/product/:id', '/product/:id/comments', '/about'],
});
```

On each navigation the SDK matches the current URL against the most specific configured template (static segments beat `:params`, which beat `*` wildcards) and records it as the current page path. That path then decorates spans, logs, and web vitals. If a URL matches no template, the raw pathname is used so a page path is always present.

This is framework-agnostic: the same `routes` config works for React Router (any version), other routers, or hand-rolled `history.pushState` navigation. If your app uses a router base path, include it in the templates.

> [!NOTE]
> The `@embrace-io/web-sdk/react-instrumentation` navigation helpers (`createReactRouterNavigationInstrumentation`, `withEmbraceRouting`, `withEmbraceRoutingLegacy`, `listenToRouterChanges`) are deprecated no-ops kept for backwards compatibility. Configure `routes` instead.

## Error Boundary

To capture rendering errors in your React components, you can use the `EmbraceErrorBoundary` component. This component will automatically capture errors that on any of its children components render and send them to Embrace.

```typescript jsx
import { EmbraceErrorBoundary } from '@embrace-io/web-sdk/react-instrumentation';

const App = () => {
  return (
    <EmbraceErrorBoundary fallback={() => <YourFallbackComponent />}>
      <>
        {/* Your app components go here */}
        <Home />
        <About />
        <Contact />
      </>
    </EmbraceErrorBoundary>
  );
}
```