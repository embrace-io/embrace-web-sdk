# check if .env file exists
if [ ! -f .env ]; then
  echo ".env file not found, create one from template and add app id"
  exit 1
fi

# clean workspaces
npm run clean --workspace=@embrace-io/web-cli --prefix ../..
npm run clean
npm run clean --prefix ../..
npm i

# compile cli
npm run compile --workspace=@embrace-io/web-cli --prefix ../..
# macos needs permissions to execute the binary
chmod +x ../../cli/build/index.js

# compile sdk
npm run compile --prefix ../..

# compile the demo - you must install dependencies again to retrieve the cli package
npm i
npm run compile

# add env vars from .env file to the current environment
export $(grep -v '^#' .env | xargs)

# find the path for the generated bundle
bundle_path=$(find ./dist/assets -name "index*.js")
source_map_path=$(find ./dist/assets -name "index*.js.map")

# process the bundle to replace the bundle id. NOTE: we don't upload source maps on each run, to avoid spamming s3, so symbolication won't work
# If you need to upload source maps for testing, remove the "--no-upload" flag
npm run demo:frontend:upload:sourcemaps -- -a $VITE_APP_ID -b "$bundle_path" -m "$source_map_path" --no-upload
npm run demo:frontend:preview
