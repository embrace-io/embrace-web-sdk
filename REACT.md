# Instrumenting a React app with the Embrace Web SDK

Besides using the `traces` and `logs` APIs, the Embrace Web SDK provides a set of tools to instrument commonly used React libraries. 

> [!TIP]
> Make sure you call `sdk.initSDK` before your React App is mounted, this will ensure that the SDK is ready to capture traces and logs from the start of your app's lifecycle.

## React Router

To instrument React Router, add the react router navigation instrumentation when you init the Embrace Web SDK.

```typescript
import { sdk } from '@embrace-io/web-sdk';
import { createReactRouterV5NavigationInstrumentation } from '@embrace-io/web-sdk/react-instrumentation';

sdk.initSDK({
  // ...Other configs
  instrumentations: [createReactRouterV5NavigationInstrumentation()],
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