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

3. **Review semantically, not by line.** This is the step that matters, and the line diff actively works against you: a regeneration rewrites and reorders large JSON blocks, so a one-attribute change can show up as hundreds of changed lines. Diff the attribute keys and values instead:

   ```bash
   python3 - <<'EOF'
   import json, subprocess, re, glob
   for f in sorted(glob.glob('tests/integration/tests/__golden__/*.json')):
       old = subprocess.run(['git','show','origin/main:'+f], capture_output=True, text=True).stdout
       new = open(f).read()
       if not old or old == new: continue
       ko = set(re.findall(r'"key":\s*"([^"]+)"', old))
       kn = set(re.findall(r'"key":\s*"([^"]+)"', new))
       print(f.split('/')[-1], 'added=', sorted(kn-ko), 'removed=', sorted(ko-kn))
   EOF
   ```

   Confirm every added and removed key is one you meant to change, and that nothing was removed by accident.

## What is expected to differ, and what is not

Some fields churn for reasons unrelated to the SDK. Seeing them move is not evidence of a bug in the change:

- `user_agent.original` shifts whenever the Playwright version bumps the bundled browser.
- `emb.stacktrace.js` frame column offsets shift on any bundler or browser-engine change.

A key appearing or disappearing is almost always a real behavior change. A value moving in one of the fields above usually is not.

## Sanity check before pushing

Confirm `browser.url.full` and the `emb.page.*` attributes still describe the same page, and that record counts per file did not change unless the change intended that.
