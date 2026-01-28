# Using the Embrace Web SDK with Next.js

The Embrace Web SDK is browser-only. This guide covers setup for both the App Router and Pages Router.

> [!TIP]
> Call `initSDK` in a Client Component or a file imported exclusively by client code.

## App Router (Next.js 13.4+)

### Step 1: Create an initialization file

Create a file that initializes the SDK once and exports the result for guard checks elsewhere in your app.

```typescript
// src/lib/embrace.ts
import { initSDK } from '@embrace-io/web-sdk';

export const embrace = initSDK({
  appID: 'xxxxx',
  appVersion: '1.0.0',
});
```

### Step 2: Create a Client Component wrapper

Create a Client Component that imports the initialization file. `layout.tsx` is a Server Component by default, so importing browser-only code there directly would execute it on the server. The `'use client'` directive ensures the SDK only runs in the browser without converting the entire layout into a Client Component.

```typescript
// src/components/EmbraceWebSdk.tsx
'use client';

import '../lib/embrace';

export default function EmbraceWebSdk() {
  return null;
}
```

### Step 3: Include in your root layout

Render `<EmbraceWebSdk />` inside the body of your root layout so the SDK initializes on every page.

```typescript
// src/app/layout.tsx
import EmbraceWebSdk from '../components/EmbraceWebSdk';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <EmbraceWebSdk />
        {children}
      </body>
    </html>
  );
}
```

### Step 4: Use SDK APIs in other Client Components

Once the SDK is initialized, you can import and use its APIs in any Client Component.

```typescript
// src/components/Checkout.tsx
'use client';

import { session } from '@embrace-io/web-sdk';

export default function Checkout() {
  const handlePurchase = () => {
    session.addBreadcrumb('purchase_started');
    // ...
  };

  return <button onClick={handlePurchase}>Buy</button>;
}
```

> [!NOTE]
> Ensure the initialization component (`EmbraceWebSdk`) is rendered before components that call SDK APIs. Placing it at the top of your root layout handles this.

## Pages Router

### Step 1: Create an initialization file

Use the same initialization file as the App Router setup.

```typescript
// src/lib/embrace.ts
import { initSDK } from '@embrace-io/web-sdk';

export const embrace = initSDK({
  appID: 'xxxxx',
  appVersion: '1.0.0',
});
```

### Step 2: Initialize in \_app.tsx

Import the initialization file at the top of `_app.tsx`. The Pages Router runs `_app.tsx` on the client, so no separate wrapper component is needed.

```typescript
// pages/_app.tsx
import '../lib/embrace';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
```

## Suppressing the Server-Side Build Warning

During the server build you may see:

```
Critical dependency: the request of a dependency is an expression
```

This happens because webpack analyzes a dynamic `require.resolve()` in `@opentelemetry/instrumentation`'s Node platform path during the server build.

To silence it, add `serverExternalPackages` to your Next.js config:

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@opentelemetry/instrumentation'],
};

export default nextConfig;
```

> [!NOTE]
> The warning is harmless — the SDK detects non-browser environments and skips initialization. This config simply silences the warning by telling Next.js to use native `require()` for that package on the server.

## Import Rules

- ✅ **Recommended:** Client Components (`'use client'`), browser-only scripts
- ⚠️ **Safe but inert:** Server Components, API routes, middleware, Server Actions — `initSDK` detects non-browser environments and returns `false` without error
- ❌ **Avoid:** Calling SDK APIs (e.g. `session`, `traces`) on the server — they require browser context

## React Instrumentation

Once the SDK is initialized, see [REACT.md](./REACT.md) for React Router and Error Boundary instrumentation.
