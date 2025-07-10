# move to sdk directory (root)
cd ../..
#build sdk locally
rm -rf node_modules
npm ci
rm -rf build
npm run sdk:compile
#build the cli locally
cd ./cli || exit
rm -rf build
npm run cli:compile
chmod +x build/index.js
#build demo locally
cd ../demo/frontend || exit
# check if .env file exists
if [ ! -f .env ]; then
  echo ".env file not found, create one from template and add app id"
  exit 1
fi
# add env vars from .env file to the current environment
export $(grep -v '^#' .env | xargs)
rm -rf build dist
npm run demo:frontend:compile
#find the path for the generated bundle
bundle_path=$(find ./dist/assets -name "index*.js")
source_map_path=$(find ./dist/assets -name "index*.js.map")
# process the bundle to replace the bundle id. NOTE: we don't upload source maps on each run, to avoid spamming s3, so symbolication won't work
# If you need to upload source maps for testing, remove the "--no-upload" flag
npm run demo:frontend:upload:sourcemaps -- -a $VITE_APP_ID -b "$bundle_path" -m "$source_map_path" --no-upload
npm run demo:frontend:preview