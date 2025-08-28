# Instrumenting a React app with the Embrace Web SDK

You can use any of the Embrace Web SDK features in your React application. However, we provide some additional automatic 
instrumentation to make it easier to instrument some common React libraries and patterns.

> [!TIP]
> Make sure you call `initSDK` before your React App is mounted, this will ensure that the SDK is ready to capture traces and logs from the start of your app's lifecycle.

## React Router

To instrument React Router, add the React Router navigation instrumentation when you init the Embrace Web SDK.

```typescript
import { initSDK } from '@embrace-io/web-sdk';
import { createReactRouterNavigationInstrumentation } from '@embrace-io/web-sdk/react-instrumentation';

initSDK({
  // ...Other configs
  instrumentations: [
    createReactRouterNavigationInstrumentation(),
  ],
})
```

### React Router V4/V5

If you're using React Router V4 or V5, you can use the `withEmbraceRoutingLegacy` higher-order component (HOC) to wrap your `Route` components. This will automatically track route changes. `EmbraceRoute` needs to be surrounded by a `<Switch>` component to properly capture the current path.

```typescript jsx
import { withEmbraceRoutingLegacy } from '@embrace-io/web-sdk/react-instrumentation';
import { Route, Router, Switch } from 'react-router-dom';

const EmbraceRoute = withEmbraceRoutingLegacy(Route);

const App = () => {
  return (
    <Router>
      <Switch>
        <EmbraceRoute path="/home" component={Home} />
        <EmbraceRoute path="/about" component={About} />
        <EmbraceRoute path="/contact" component={Contact} />
      </Switch>
    </Router>
  );
}
```

### React Router V6+ in declarative mode

If you're using React Router V6 or later, you can use the `withEmbraceRouting` higher-order component (HOC) to wrap your `Routes` components. This will automatically track route changes. 

```typescript jsx
import { withEmbraceRouting } from '@embrace-io/web-sdk/react-instrumentation';
import { Route, Routes, BrowserRouter } from 'react-router-dom';

const EmbraceRoutes = withEmbraceRouting(Routes);

const App = () => {
  return (
    <BrowserRouter>
      <EmbraceRoutes>
        <Route path="/home" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
      </EmbraceRoutes>
    </BrowserRouter>
  )
}
```

### React Router V6+ in data mode

When using data mode in React Router, you can listen to browser changes using `listenToRouterChanges` to automatically track route changes.

```typescript jsx
import { listenToRouterChanges } from '@embrace-io/web-sdk/react-instrumentation';
import {
  createBrowserRouter,
  RouterProvider,
  matchRoutes,
} from 'react-router-dom';
import { useEffect } from 'react';

const router = createBrowserRouter([
  {
    path: '/home',
    element: <Home />,
  },
  {
    path: '/about',
    element: <About />,
  },
  {
    path: '/contact',
    element: <Contact />,
  }
]);

const App = () => {
  useEffect(() => {
    // It's important that `listenToRouterChanges` is called on a useEffect so it starts tracking routes once the App is mounted.
    // Otherwise some early telemetry can be missed if this gets initialized too early.
    // Return the cleanup function to stop listening to route changes when the component unmount.
    return listenToRouterChanges({
      router,
      // Use `matchRoutes` from React Router to match the current route.
      routesMatcher: matchRoutes,
    });
    // Set an empty dependency array to run this effect only once.
  }, []);

  return (
    <RouterProvider router={router} />
  )
}
```

### Configuration

You can configure the React Router instrumentation by passing options to the `createReactRouterNavigationInstrumentation` function.
For now, the only option available is `shouldCleanupPathOptionsFromRouteName`.
If set to `true`, the instrumentation will remove path options from the route name, e.g. it will convert `/order/:orderState(pending|shipped|delivered)` to `/order/:orderState`.

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