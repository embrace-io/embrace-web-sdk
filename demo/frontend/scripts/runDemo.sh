# move to sdk directory (root)
cd ../..
#print current node version
node -v
#build sdk locally
rm -rf node_modules
npm ci
rm -rf build
npm run sdk:compile
#build the cli locally
cd ./cli || exit
rm -rf node_modules
npm ci
rm -rf build
npm run cli:compile
#build demo locally
cd ../demo/frontend || exit
rm -rf node_modules
npm ci
sed 's/VITE_APP_ID=your_app_id/VITE_APP_ID=5przi/g' .env.template > .env
rm -rf build dist
npm run demo:frontend:compile
#find the path for the generated bundle
bundle_path=$(find ./dist/assets -name "index*.js")
source_map_path=$(find ./dist/assets -name "index*.js.map")
# process the bundle to replace the bundle id. NOTE: we don't upload source maps on each run, to avoid spamming s3, so symbolication won't work
# If you need to upload source maps for testing, remove the "--no-upload" flag
npm run demo:frontend:upload:sourcemaps -- -b "$bundle_path" -m "$source_map_path" --no-upload
npm run demo:frontend:preview


