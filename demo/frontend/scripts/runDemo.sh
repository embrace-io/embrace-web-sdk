# create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "# Add your appID from https://dash.embrace.io" > .env
    echo "VITE_APP_ID=" >> .env
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

# clean workspaces
npm run clean --prefix ../..

# compile sdk and build demo
npm install
npm run build

# add env vars from .env file to the current environment
export $(grep -v '^#' .env | xargs)

# find the path for the generated bundle
bundle_path=$(find ./dist/assets -name "index*.js")
source_map_path=$(find ./dist/assets -name "index*.js.map")

# process the bundle to replace the bundle id. NOTE: we don't upload source maps on each run, to avoid spamming s3, so symbolication won't work
# If you need to upload source maps for testing, remove the "--no-upload" flag
if [ -n "$VITE_APP_ID" ]; then
    npm run demo:frontend:upload:sourcemaps -- -a $VITE_APP_ID -b "$bundle_path" -m "$source_map_path" --no-upload
fi

npm run demo:frontend:preview
