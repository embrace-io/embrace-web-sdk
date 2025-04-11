# Embrace Web SDK CLI

This tool is intended to help with build-time tasks for the [Embrace Web SDK](../README.md).

## Quick Start

npm:

```sh
npm install --save-dev @embrace-io/web-cli
```

yarn:

```sh
yarn add -D @embrace-io/web-cli
```

## Upload sourcemaps

To upload sourcemaps to Embrace as part of your build process you will require the following:
* Your Embrace App ID
* Your Embrace `Symbol Upload` API token (found in your Embrace dashbboard in
[Settings->API](https://dash.embrace.io/settings/organization/api))
* The path to your built JS bundle
* The path to your JS sourcemap file

Note that uploading multiple JS bundles and sourcemaps is not currently supported.

```sh
npx embrace-web-cli upload -a "YOUR_EMBRACE_APP_ID" -t "YOUR_EMBRACE_UPLOAD_API_TOKEN" -b "BUNDLE_PATH" -m "SOURCE_MAP_PATH"
```

## Setting app version

The same `upload` sub-command as above can be used to inject your app's version into your bundle if the value is only
known at build time. (If the version is known prior to build time you can provide it when initializing the SDK as
described in [Keeping your app version up-to-date](../README.md#including-the-sdk-as-a-code-snippet-from-cdn). Execute
the same command as above while also providing your app's version:

```sh
npx embrace-web-cli upload -a "YOUR_EMBRACE_APP_ID" -t "YOUR_EMBRACE_UPLOAD_API_TOKEN" -b "BUNDLE_PATH" -m "SOURCE_MAP_PATH" --app-version "APP_VERSION"
```
