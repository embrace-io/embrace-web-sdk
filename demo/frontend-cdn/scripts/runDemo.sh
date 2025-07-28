#!/bin/bash

# create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "# Add your appID from https://dash.embrace.io" > .env
    echo "VITE_APP_ID=" >> .env
    echo "VITE_ASYNC_MODE=false" >> .env
fi

# if .env file exists, check if it contains a valid appID
if [ -f .env ]; then
    app_id=$(grep -E "^VITE_APP_ID=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [ -z "$app_id" ]; then
        echo ""
        echo " ┌───────────────────────────────────────────────────────────────────┐"
        echo " │  .env is missing appID. Please signup at https://dash.embrace.io  │"
        echo " │    or continue to preview the demo in browser console mode only   │"
        echo " └───────────────────────────────────────────────────────────────────┘"
        echo ""
        read -p "Press Enter to continue without connecting to Embrace Dashboard..."
    elif ! echo "$app_id" | grep -qE "^[a-zA-Z0-9]{5}$"; then
        echo ""
        echo " ┌─────────────────────────────────────────────────────────────────────┐"
        echo " │                      .env has invalid appID                         │"
        echo " │     Visit https://dash.embrace.io to get your 5 character appID     │"
        echo " └─────────────────────────────────────────────────────────────────────┘"
        echo ""
        exit 1
    fi
fi

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
rm -rf build dist
npm run demo:cdn:sync:web:sdk

# add env vars from .env file to the current environment
export $(grep -v '^#' .env | xargs)

if [ "$ASYNC_MODE" = true ]; then
  npm run demo:cdn:frontend:compile:async
else
  npm run demo:cdn:frontend:compile
fi

npm run demo:cdn:frontend:preview
