find ./platforms -mindepth 2 -maxdepth 2 -type f -name package.json | while read pkg; do
  dir=$(dirname "$pkg")
  echo "Installing dependencies in $dir"
  npx -y bun install --no-save --cwd "$dir"
done
