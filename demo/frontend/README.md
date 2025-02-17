This is a simple (extremely simple) demo app that shows how to use the embrace-web-sdk and the sourcemaps-uploader in a
React app.

## TLDR

Running the demo app locally involves several steps. If you don't really need to customize anything and just want to try
what it is already there, you can run `npm run demo:frontend:full:preview` from the `demo/frontend` directory. This will
take care of all the steps below, just make sure you have node installed (version 22+). For more granular control, keep
reading :)

## Testing the embrace-web-sdk

The dependency between the demo app and the sdk is managed through `demo/frontend/package.json`. Specifically, the line
`"@embraceio/embrace-web-sdk": "file:../..",`. This tell npm to use the local version of the sdk instead of downloading
a remote one from npm registry. When you run `npm install` in the `demo/frontend` directory, npm will install the sdk
from the local directory`../../` (which is the root of the sdk project). If you check the
`node_modules/@embraceio/embrace-web-sdk` directory, you will see that it is a symlink to the root of the sdk project.
This will ensure that the demo app uses the latest version of the sdk, even before it is published, for testing
purposes.

Note: even while the sdk is not published, the exported fields from `package.json` (root level, for the sdk) are still
honored. This means that the demo app will import the sdk as if it was published and from `build/esm/index.js`, instead
of referencing the source code for the sdk directly.

With all of these, here are the steps to run the demo app referencing the latest version of the sdk:

1. Run `npm install` in the root of the sdk project. This will install all the dependencies for the sdk.
2. Run `npm run sdk:compile:clean` in the root of the sdk project. This will remove any previous local builds of the
   SDK, to make sure that the demo app uses the latest version of the SDK.
3. Run `npm run sdk:compile` in the root of the sdk project. This will compile the SDK and make it available for the
   demo app later from `build/esm/index.js`.
4. Delete the `node_modules` directory in the `demo/frontend` directory. This will remove the symlink to the sdk
   project, so it can be regenerated later.
5. Run `npm install` in the `demo/frontend` directory. This will install all the dependencies for the demo app,
   including the sdk.
6. Copy the file located at `demo/frontend/.env.template` to `demo/frontend/.env` and modify with your custom envs.
7. Run `npm run demo:frontend:dev` in the `demo/frontend` directory. This will start the demo app in development mode,
   with hot reloading enabled.
8. Open your browser and go to `http://localhost:5173/`. You should see the demo app running.  
   If you make changes to the demo frontend app, then the hot reloading will automatically reload the app in the
   browser. If you make changes to the sdk, then you will need to recompile the sdk and restart the demo app (steps 2,
   3, 4, 5, 6). If you want to test the demo app in production mode, bundled, then repeat steps 1 through 5 and then.
9. Run `npm run demo:frontend:compile` in the `demo/frontend` directory. This will build the demo app in production
   mode. The output will be at `demo/frontend/dist`
10. Run `npm run demo:frontend:preview` in the `demo/frontend` directory. This will serve the demo app in production
    mode. Open your browser and go to ` http://localhost:4173/`. You should see the demo app running.

## Testing the sourcemaps-uploader

The dependency between the demo app and the cli is managed through `demo/frontend/package.json`. Specifically, the line
`"@embraceio/sourcemaps-uploader": "file:../../cli",`. This tell npm to use the local version of the cli instead of
downloading
a remote one from npm registry. When you run `npm install` in the `demo/frontend` directory, npm will install the cli
from the local directory `../../cli`.
If you check the `node_modules/@embraceio/sourcemaps-uploader` directory, you will see that it is a symlink to `./cli`.
This will ensure that the demo app uses the latest version of the cli, even before it is published, for testing
purposes.
Note: even while the cli is not published, the exported fields from `cli/package.json` are still honored. This means
that the demo app will import the cli as if it was published and from `build/index.js`, instead of referencing the
source code for the cli directly.
With all of these, here are the steps to run the demo app referencing the latest version of the cli:

1. Run `npm install` in the root of the cli project. This will install all the dependencies for the cli.
2. Run `npm run cli:compile:clean` in the root of the cli project. This will remove any previous local builds of the
   cli, to make sure that the demo app uses the latest version of the cli. Changes to the source are NOT automatically
   synced
3. Run `npm run cli:compile` in the root of the cli project. This will compile the cli and make it available for the
   demo app later from `build/index.js`.
4. Delete the `node_modules` directory in the `demo/frontend` directory. This will remove the symlink to the cli
   project, so it can be regenerated later.
5. Run `npm install` in the `demo/frontend` directory. This will install all the dependencies for the demo app,
   including the cli.
6. Copy the file located at `demo/frontend/.env.template` to `demo/frontend/.env` and modify with your custom envs.
7. Run `npm run demo:frontend:compile` in the `demo/frontend` directory. This will build the demo app in production
   mode. The output will be at `demo/frontend/dist`
7. Run `npm run demo:frontend:upload:sourcemaps:dry -- -b <path_to_bundle_file.js> -m <path_to_map_file.js.map>` in
   the `demo/frontend` directory. This will trigger a "dry" run to
   upload the sourcemaps to embrace. As this is a dry run, it won't actually upload anything. If you do want to
   upload source maps, you need to use `npm run demo:frontend:upload:sourcemaps:stg` or
   `npm run demo:frontend:upload:sourcemaps` instead (for stg and prod, respectively). The values of
   `<path_to_bundle_file.js>` and `<path_to_map_file.js.map>` will be the file path for the compiled
   bundle for the demo app. Example:
   `npm run demo:frontend:upload:sourcemaps:dry -- -b ./dist/assets/index-BFp_59-e.js -m ./dist/assets/index-BFp_59-e.js.map`.
   Note that if you made changes to the demo app, the hash in the names of these files will change, so you will get a
   new file name after a new build.