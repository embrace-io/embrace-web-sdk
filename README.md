## Publishing

To publish a new version of the sdk, you need to run `npm publish`. It will create a clean build under `build` folder
including ESM modules as .js files and .d.ts type definition, it will then publish the package to an npm repo.
Note: there is no public npm registry yet, so you can't publish the package to npmjs.com.
For development, login to https://repo.embrace.io/repository/web-testing/ and publish the package there.
For login in, you can run
`npm login --scope=@embraceio --registry=https://repo.embrace.io/repository/web-testing/`
