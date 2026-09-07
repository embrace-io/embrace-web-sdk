# npm exports the repo-root .npmrc to child processes as npm_config_*, and env config
# outranks each platform's own .npmrc, so these fixtures would otherwise resolve with the
# monorepo's settings instead of the way a standalone consumer of the SDK does.
unset npm_config_install_strategy npm_config_prefer_dedupe npm_config_lockfile_version

find ./platforms -mindepth 2 -maxdepth 2 -type f -name package.json | while read pkg; do
  dir=$(dirname "$pkg")
  echo "Installing dependencies in $dir"
  npm install --ignore-scripts --prefix "$dir"
done
