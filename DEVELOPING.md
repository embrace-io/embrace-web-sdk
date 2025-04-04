## Setup

```sh
npm install
```

## Repo layout

* `api-*/`
  * High-level APIs that expose the SDK's functionality. By default these interfaces are backed by no-op implementations
so that instrumentations and application code that rely on them continue to function in the absence of an initialized SDK. 
* `managers/`
  * Classes that provide concrete implementations of the interfaces defined in `api-*/`
* `exporters/`
  * 
* `instrumentations/`
  * Responsible for producing telemetry 
* `processors/`
* `resources/`
* `sdk/`
* `transport/`
* `utils/`

## Testing

We use Mocha (test runner), Playwright (browser launcher), Chai (assertion library) and web-test-runner (general
framework that ties everything else together).

TODO: add nyc for coverage


## Publishing

To publish a new version of the sdk, you need to run `npm publish`. It will create a clean build under `build` folder
including ESM modules as .js files and .d.ts type definition, it will then publish the package to an npm repo.

TODO:

* Add Lerna to manage testing across packages (demo, sdk, cli), 
* Publish typedoc doc 
* Add amannn/action-semantic-pull-request@v5 
* Add semantic-release