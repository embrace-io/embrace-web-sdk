# move to sdk directory (root)
cd ../..
#print current node version
node -v
#build sdk locally
rm -rf node_modules
npm ci
rm -rf build
npm run sdk:compile:esm
npm run sdk:compile:esm:bundle
#build demo locally
cd ./demo/frontend-cdn || exit
rm -rf node_modules
npm ci
sed -e 's/VITE_APP_ID=your_app_id/VITE_APP_ID=5przi/g' -e 's/VITE_SAMPLE_PERCENTAGE=1/VITE_SAMPLE_PERCENTAGE=0.5/g' .env.template > .env
rm -rf build dist
npm run demo:cdn:frontend:compile
npm run demo:cdn:frontend:preview
