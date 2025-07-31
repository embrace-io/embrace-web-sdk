#!/bin/bash

# Check for "async" as a command-line argument
ASYNC_MODE=false
for arg in "$@"; do
  if [[ "$arg" == "--async" || "$arg" == "async" ]]; then
    ASYNC_MODE=true
  fi
done

# move to sdk directory (root)
cd ../..
#print current node version
node -v
#build sdk locally
rm -rf node_modules
npm ci
rm -rf build
npm run compile
#build demo locally
cd ./demo/frontend-cdn || exit

# create .env file if it doesn't exist
if [ ! -f .env ]; then
  echo ".env file not found, create one from template and add app id"
  exit 1
fi

rm -rf build dist
npm run demo:cdn:sync:web:sdk

if [ "$ASYNC_MODE" = true ]; then
  npm run demo:cdn:frontend:compile:async
else
  npm run demo:cdn:frontend:compile
fi

npm run demo:cdn:frontend:preview
