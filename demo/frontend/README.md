# Embrace Web SDK Demo

This is a comprehensive React demo application that showcases the full
capabilities of the Embrace Web SDK and web-cli tools.

## ⏩ Quick Start

```bash
npm ci && npm run demo
```

## What This Demo Includes

- **Session Management**: Start, end, and override session spans with real-time
  session ID tracking
- **Custom Spans**: Create and manage custom OpenTelemetry spans for performance
  monitoring
- **Logging**: Test different log levels (info, warning, error) with custom
  attributes
- **Exception Handling**: Demonstrate error recording, throwing exceptions, and
  promise rejection handling
- **Network Monitoring**: Automatic instrumentation of fetch and XMLHttpRequest
  calls
- **React Integration**: Error boundaries and routing instrumentation for React
  Router v4/v5 and v6+
- **Session Properties**: Add and remove permanent and session-scoped properties
- **Navigation Tracking**: Monitor page navigation and external link clicks
- **Source Map Upload**: Integration with the web-cli for production debugging

## 📋 Prerequisites

- **Node.js**:
  [Install nvm](https://github.com/nvm-sh/nvm?tab=readme-ov-file#installing-and-updating)
  and run `nvm use` to install the latest supported version
- **Embrace App ID**: Get your 5-character App ID from your
  [Embrace dashboard](https://dash.embrace.io)

> 💡 **Note**: The demo will automatically create an empty `.env` file if you
> don't have one. Add your Embrace App ID to start sending data to the
> dashboard. Otherwise, the demo will run in browser console-only mode.

## 🚀 Run the Demo

This command compiles the SDK, builds the demo app, and opens
`http://localhost:4173` in your browser automatically. This is a "production"
build preview and does not refresh on file changes.

```bash
npm run demo
```

## 🔧 Development Mode

The demo app uses your local SDK source code instead of the published npm
package. In the demo's `package.json`, the dependency
`"@embrace-io/web-sdk": "../../packages/web-sdk"` creates a direct link to the SDK source
code two directories up. This means any changes you make to the SDK will be
immediately available in the demo app.

For the fastest development experience with hot reloading:

```bash
# Go to the SDK root directory
cd ../..
npm run dev
```

This single command will:

- Watch and rebuild the SDK automatically
- Start the demo app with hot reloading
- Open your browser to `http://localhost:5173`

## 📤 Testing Source Map Upload

The demo app uses a local CLI dependency
(`"@embrace-io/web-cli": "../../packages/web-cli"`) to test source map upload
functionality directly from your development environment.

The CLI uploads source maps to Embrace for better production debugging:

```bash
# Ensure the cli is compiled and the demo is built
npm run build

# Dry run (preview files to be uploaded without actually uploading them)
npm run upload-sourcemaps:dry

# Real upload (requires valid appID in your .env file)
npm run upload-sourcemaps
```

> 💡 **Note**: The CLI automatically detects and uploads source maps from the
> `./dist` directory, including files with unique hash values (e.g.,
> `main-abc123.js`).
