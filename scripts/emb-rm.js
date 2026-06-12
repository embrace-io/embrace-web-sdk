#!/usr/bin/env node
// Recursively removes the given paths. Arguments may be literal paths or glob
// patterns (e.g. "**/dist"), resolved against the working directory.

import { globSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const packageRoot = process.cwd();
const targets = globSync(process.argv.slice(2)).map((path) => resolve(path));

// Refuse to delete anything at or outside the working directory, so a
// mistyped relative path cannot remove the package itself or its siblings.
// Validated before any removal so a bad argument deletes nothing at all.
const escaped = targets.filter(
  (target) => !target.startsWith(packageRoot + sep),
);
if (escaped.length > 0) {
  for (const target of escaped) {
    console.error(`Refusing to remove ${target}: outside ${packageRoot}`);
  }
  process.exit(1);
}

for (const target of targets) {
  rmSync(target, { recursive: true, force: true });
}
