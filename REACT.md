# Instrumenting a React app with the Embrace Web SDK

Besides using the `traces` and `logs` APIs, the Embrace Web SDK provides a set of tools to instrument commonly used React libraries. 

> [!TIP]
> Make sure you call `sdk.initSDK` before your React App is mounted, this will ensure that the SDK is ready to capture traces and logs from the start of your app's lifecycle.

## React Router

To instrument React Router, add the react router navigation instrumentation when you init the Embrace Web SDK.

```typescript
import { sdk } from '@embrace-io/web-sdk';
import { createReactRouterNavigationInstrumentation } from '@embrace-io/web-sdk/react-instrumentation';

sdk.initSDK({
  // ...Other configs
  instrumentations: [createReactRouterNavigationInstrumentation()],
})
```

### React Router V4/V5

If you're using React Router V4 or V5, you can use the `withEmbraceRouting` higher-order component (HOC) to wrap your `Route` components. This will automatically track route changes. `EmbraceRoute` needs to be surrounded by a `<Switch>` component to properly capture the current path.

```typescript jsx
import { withEmbraceRouting } from '@embrace-io/web-sdk/react-instrumentation';
import { Route, Router, Switch } from 'react-router-dom';

const EmbraceRoute = withEmbraceRouting(Route);

const App = () => {
  return (
    <Router>
      <Switch>
        <EmbraceRoute path="/home" component={Home} />
        <EmbraceRoute path="/about" component={About} />
        <EmbraceRoute path="/contact" component={Contact} />
      </Switch>
    </Router>
  )
}
```