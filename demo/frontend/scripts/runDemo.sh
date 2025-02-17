# move to sdk directory (root)
cd ../..
#print current node version
node -v
#build sdk locally
npm run sdk:install:clean
npm install
npm run sdk:compile:clean
npm run sdk:compile
#build the cli locally
cd ./cli
npm run cli:install:clean
npm install
npm run cli:compile:clean
npm run cli:compile
#build demo locally
cd ../demo/frontend
npm run demo:frontend:install:clean
npm install
sed 's/VITE_APP_ID=your_app_id/VITE_APP_ID=pa6hp/g' .env.template > .env
npm run demo:frontend:compile:clean
npm run demo:frontend:compile
#find the path for the generated bundle
bundle_path=$(find ./dist/assets -name "index*.js")
source_map_path=$(find ./dist/assets -name "index*.js.map")
# process the bundle to replace the bundle id. NOTE: we don't upload source maps on each run, to avoid spamming s3, so symbolication won't work
# If you need to upload source maps for testing, remove the "-u=false" flag
npm run demo:frontend:upload:sourcemaps -- -b "$bundle_path" -m "$source_map_path" -u=false
npm run demo:frontend:preview


