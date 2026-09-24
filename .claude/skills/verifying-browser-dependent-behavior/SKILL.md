---
name: verifying-browser-dependent-behavior
description: Use when touching code that feature-detects a browser API (isEntryTypeSupported, PerformanceObserver.supportedEntryTypes) or when a test's outcome could depend on which browser Playwright bundles - covers pinning detection in tests and running the multi-browser suite.
---

# Verifying Browser-Dependent Behavior

Any code path gated on feature detection makes its tests a function of the browser Playwright happens to bundle. That dependency is invisible until a version bump flips it, and a test can pass for years without ever exercising the branch it claims to cover.

## Pin the detection, do not inherit it

`isEntryTypeSupported` reads `PerformanceObserver.supportedEntryTypes`. A test that leaves it alone asserts against whatever the current browser supports, so the branch under test changes when the browser does.

Stub it instead, and assert **both** branches. Which stub you need depends on whether the code under test only *checks* support or goes on to *create an observer*.

**Detection only.** When the assertion is about which branch was taken, a class carrying just the static flag is enough:

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

**Anything that observes.** The stub above is a trap for instrumentations that reach `createPerformanceObserver`, which is most of them (Loaf, ElementTiming, soft navigation). It calls `observer.observe(...)` inside a `try` whose `catch { return null }` swallows everything, so a stub with no `observe` method silently yields a null observer and the test asserts nothing. Mock the full shape and keep a handle to feed entries through:

```ts
class MockPerformanceObserver {
  public static supportedEntryTypes = ['long-animation-frame'];
  public constructor(callback: ObserverCallback) {
    observerCallback = callback;
  }
  public observe(options: { type: string; buffered: boolean }): void {
    observeOptions = options;
  }
  public disconnect(): void {
    observerDisconnected = true;
  }
}
```

See `LoafInstrumentation.test.ts` and `performanceObserver.test.ts` for the full pattern. Stub before constructing the instrumentation either way: support flags are usually resolved once in the constructor.

## Prove the test is not vacuous

A test whose branch is unreachable passes without asserting anything. Before trusting a new test on a feature-detected path, temporarily invert the implementation and confirm the test fails. If it still passes, it is not testing what its name claims.

Soft navigation is the concrete case in this repo, and it runs the opposite way from what you might assume: the bundled Chromium (151) **does** support `soft-navigation`, so the native branch is the default and the polyfill branch is the one that goes unexercised unless you force it. `tests/integration/playwright.config.headed.ts` runs both as separate projects, passing `--disable-features=SoftNavigationHeuristics` to reach the polyfill path the way Chrome versions below 151 would.

The lesson generalizes: check which way the default actually falls before assuming which branch your test is covering. Do not assume the unsupported path is the common one.

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
