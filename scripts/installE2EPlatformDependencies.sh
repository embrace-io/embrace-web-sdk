find ./tests/integration/platforms -mindepth 2 -maxdepth 2 -type f -name package.json | while read pkg; do
  dir=$(dirname "$pkg")
  echo "Installing dependencies in $dir"
  npm install --prefix "$dir"
done
