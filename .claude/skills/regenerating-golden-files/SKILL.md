---
name: regenerating-golden-files
description: Use when an SDK change alters emitted telemetry and the integration golden files need regenerating - covers building first, choosing the local or container run, and reviewing the diff semantically instead of by line.
---

# Regenerating Golden Files

Golden files live in `tests/integration/tests/__golden__/` and capture the exact OTLP payloads the SDK emits. Any change to emitted attributes, log records, or spans will change them.

**Never hand-edit a golden file.** Instance IDs, trace/span IDs and timestamps regenerate on every run, so a hand edit is indistinguishable from a real change on the next regeneration.

## Procedure

1. **Build first.** The integration harness tests the built artifacts, not `src/`. Skipping this regenerates goldens against a stale bundle and the diff will look wrong in ways that are hard to attribute.

   ```bash
   npm run build
   ```

2. **Regenerate.** Local is fast and fine for iterating:

   ```bash
   npm run test:integration:update-golden
   ```

   The container run matches CI exactly and is the safer choice before pushing:

   ```bash
   npm run test:integration:container:update-golden
   ```

3. **Review semantically, not by line.** This is the step that matters, and the line diff actively works against you: a regeneration rewrites and reorders large JSON blocks, so a one-attribute change can show up as hundreds of changed lines. Diff the attribute keys instead, with the script in "Diffing attribute keys" below.

   Confirm every added and removed key is one you meant to change, and that nothing was removed by accident.

## Diffing attribute keys

Run this from the repo root. It compares the working tree against `origin/main` and prints the attribute keys that appeared and disappeared per file.

It always prints a trailing summary line, on purpose. Every check below exits nonzero with a message rather than printing nothing, because the failure that matters here is the one that looks like success: a comparison that comes back empty reads as "no attributes changed" whether that is true or the comparison never happened.

```bash
python3 - <<'EOF'
import glob, re, subprocess, sys

BASE = 'origin/main'
GOLDEN = 'tests/integration/tests/__golden__'


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, text=True)


if git('rev-parse', '--show-toplevel').returncode != 0:
    sys.exit('not inside a git repo. Run from the repo root.')

# An unresolvable base ref makes every file look unchanged, so stop rather than report nothing.
if git('rev-parse', '--verify', '--quiet', f'{BASE}^{{commit}}').returncode != 0:
    sys.exit(f'{BASE} does not resolve. Run: git fetch origin main')

keys = lambda blob: set(re.findall(r'"key":\s*"([^"]+)"', blob))

# Union both sides: globbing only the working tree would never visit a deleted golden file.
base_files = set(git('ls-tree', '-r', '--name-only', BASE, GOLDEN).stdout.splitlines())
work_files = set(glob.glob(f'{GOLDEN}/*.json'))
if not base_files and not work_files:
    sys.exit('no golden files found. Run from the repo root.')

changed = 0
for f in sorted(base_files | work_files):
    old = ''
    if f in base_files:
        show = git('show', f'{BASE}:{f}')
        if show.returncode != 0:
            sys.exit(f'git show failed for {f}: {show.stderr.strip()}')
        old = show.stdout
    new = open(f).read() if f in work_files else ''
    if old == new:
        continue
    changed += 1
    state = 'NEW FILE' if not old else 'DELETED' if not new else 'changed'
    ko, kn = keys(old), keys(new)
    print(f'{f.split("/")[-1]} [{state}] added={sorted(kn - ko)} removed={sorted(ko - kn)}')

print(f'-- compared {len(base_files | work_files)} files against {BASE}, {changed} changed')
EOF
```

A `[NEW FILE]` or `[DELETED]` marker means the file itself appeared or disappeared, so every key it holds is listed. That is expected when adding or removing an integration test case, and is worth a second look otherwise.

## What is expected to differ, and what is not

Some fields churn for reasons unrelated to the SDK. Seeing them move is not evidence of a bug in the change:

- `user_agent.original` shifts whenever the Playwright version bumps the bundled browser.
- `emb.stacktrace.js` frame column offsets shift on any bundler or browser-engine change.

A key appearing or disappearing is almost always a real behavior change. A value moving in one of the fields above usually is not.

## Sanity check before pushing

Confirm `browser.url.full` and the `emb.page.*` attributes still describe the same page, and that record counts per file did not change unless the change intended that.
