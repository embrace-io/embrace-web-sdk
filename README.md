---
  ![GitHub Release Date](https://img.shields.io/github/release-date/embrace-io/embrace-web-sdk)
    ![GitHub commit activity](https://img.shields.io/github/commit-activity/t/embrace-io/embrace-web-sdk)
    [![Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-orange)](./LICENSE.txt)
    ![GitHub top language](https://img.shields.io/github/languages/top/embrace-io/embrace-web-sdk)
    ![Build and tests status](https://github.com/embrace-io/embrace-web-sdk/actions/workflows/ci-nodejs.yml/badge.svg)
---

## Publishing

To publish a new version of the sdk, you need to run `npm publish`. It will create a clean build under `build` folder
including ESM modules as .js files and .d.ts type definition, it will then publish the package to an npm repo.
Note: there is no public npm registry yet, so you can't publish the package to npmjs.com.
For development, login to https://repo.embrace.io/repository/web-testing/ and publish the package there.
For login in, you can run
`npm login --scope=@embraceio --registry=https://repo.embrace.io/repository/web-testing/`

## Testing

We use Mocha (test runner), Playwright (browser launcher), Chai (assertion library) and web-test-runner (general
framework that ties everything else together).

TODO: add nyc for coverage

## Publishing

TODO:

* Add Lerna to manage testing across packages (demo, sdk, cli),
* Publish to npm,
* Publish typedoc doc
* Add CI/CD pipeline
* Add amannn/action-semantic-pull-request@v5
* Add semantic-release