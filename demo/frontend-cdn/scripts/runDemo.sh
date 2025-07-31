#!/bin/bash

# Check for "async" as a command-line argument
ASYNC_MODE=false
for arg in "$@"; do
  if [[ "$arg" == "--async" || "$arg" == "async" ]]; then
    ASYNC_MODE=true
  fi
done

# clean workspaces
npm run clean --prefix ../..

# compile sdk and build demo
npm ci --prefix ../..
npm run compile --prefix ../..
npm install

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
