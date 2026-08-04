---
name: verifying-browser-dependent-behavior
description: Use when touching code that feature-detects a browser API (isEntryTypeSupported, PerformanceObserver.supportedEntryTypes) or when a test's outcome could depend on which browser Playwright bundles - covers pinning detection in tests and running the multi-browser suite.
---

# Verifying Browser-Dependent Behavior

Any code path gated on feature detection makes its tests a function of the browser Playwright happens to bundle. That dependency is invisible until a version bump flips it, and a test can pass for years without ever exercising the branch it claims to cover.

## Pin the detection, do not inherit it

`isEntryTypeSupported` reads `PerformanceObserver.supportedEntryTypes`. A test that leaves it alone asserts against whatever the current browser supports, so the branch under test changes when the browser does.

Stub it instead, and assert **both** branches:

```ts
let originalPerformanceObserver: typeof globalThis.PerformanceObserver;

const stubSupportedEntryTypes = (types: string[]) => {
  (globalThis as Record<string, unknown>)['PerformanceObserver'] = class {
    public static supportedEntryTypes = types;
  };
};

beforeEach(() => {
  originalPerformanceObserver = globalThis.PerformanceObserver;
});

afterEach(() => {
  (globalThis as Record<string, unknown>)['PerformanceObserver'] =
    originalPerformanceObserver;
});
```

Stub before constructing the instrumentation: support flags are usually resolved once in the constructor.

## Prove the test is not vacuous

A test whose branch is unreachable passes without asserting anything. Before trusting a new test on a feature-detected path, temporarily invert the implementation and confirm the test fails. If it still passes, it is not testing what its name claims.

This is not hypothetical: a soft-navigation URL test in this repo passed for months only because the bundled Chromium never supported `soft-navigation`, and it asserted the opposite of what the code did.

## Run the multi-browser suite

Firefox and WebKit lack APIs Chromium has, so they are the real check that detection is pinned rather than inherited:

```bash
npm run test:multiBrowsers
```

Use the npm script rather than invoking `web-test-runner` directly, so the turbo filter and config resolution stay consistent.

To iterate on one file first:

```bash
npx turbo run test --filter=@embrace-io/web-sdk -- --files "src/path/to/File.test.ts"
```

## When a dependency bump breaks a test

Check whether the browser changed before changing the test. Compare the bundled version across the bump, and confirm whether the entry type or API in question became available:

```bash
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();console.log(b.version(),await p.evaluate(()=>PerformanceObserver.supportedEntryTypes));await b.close()})()"
```

A test that starts failing on a version bump is often correct behavior newly reaching a branch that was previously dead, not a regression.
