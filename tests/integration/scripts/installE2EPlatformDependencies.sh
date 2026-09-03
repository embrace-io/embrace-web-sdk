find ./platforms -mindepth 2 -maxdepth 2 -type f -name package.json | while read pkg; do
  dir=$(dirname "$pkg")
  echo "Installing dependencies in $dir"
  # The repo-root .npmrc sets install-strategy=linked. npm's arborist crashes
  # (`Cannot read properties of null (reading 'isDescendantOf')`) resolving peer
  # conflicts under that strategy for several of these fixtures' dependency
  # trees, so these installs pin back to npm's default, better-tested strategy.
  npm install --ignore-scripts --install-strategy=hoisted --prefix "$dir"
done
