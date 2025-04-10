## Setup

```sh
git clone git@github.com:embrace-io/embrace-web-sdk.git
cd embrace-web-sdk
npm install
```

## Repo layout

The code within `src/` is divided as follows:

* `api-*/`
  * High-level APIs that expose the SDK's functionality. By default these interfaces are backed by no-op implementations
so that instrumentations and application code that rely on them continue to function in the absence of an initialized SDK. 
* `managers/`
  * Classes that provide concrete implementations of the interfaces defined in `api-*/`
* `exporters/`
  * Serializes telemetry into payloads for sending data to Embrace
* `instrumentations/`
  * Responsible for producing telemetry signals. Should be loosely coupled with the SDK and only assume functionality
  provided by high-level APIS (which may be no-ops if the SDK has not been initialized). Should allow themselves to be
  turned off at any point.
* `processors/`
  * Hooks into the creation and finalization of telemetry signals in order to do some additional processing. This can be
  appending attributes, batching before sending to an exporter, applying limits, etc.
* `resources/`
  * Controls which attributes are included in the Resource object attached to each payload.
* `sdk/`
  * Main entry point for initializing the SDK
* `transport/`
  * Low-level facilities for controlling the actual sending of data and error-handling

## Testing

We use Mocha (test runner), Playwright (browser launcher), Chai (assertion library) and web-test-runner (general
framework that ties everything else together).

Run tests with:

```sh
npm run sdk:test
```

For debugging, you can run tests in a browser to set breakpoints, open the dev console, etc. with:

```
npm run sdk:test:manual
```

Manual mode as well as other debugging options can also be reached from watch mode:

```
npm run sdk:test:watch
```

## Publishing

New releases of the SDK are triggered through [Github Releases](https://github.com/embrace-io/embrace-web-sdk/releases).
Commits merged to main are added to the next Draft release. Once these are ready the Draft can be set to Published to
trigger a publish of the SDK packages to NPM.

Note: the level of the version bump (major, minor, patch) is determined by the type of changes made to the SDK since the
last release. You can see the requirements for each type of bump in
our [release-drafter config -> autolabeler](./.github/release-drafter.yml)

The release version will be generated based on the content of the pull requests merged since the last release. We
use https://github.com/release-drafter/release-drafter to generate new releases and https://commitlint.js.org/ to make
sure PRs follow our commit convention