// This is the non-minified version of the code snippet that gets injected into JS files when running the cli tool.
// This code is never executed by the sdk, but we keep it as source of truth for the minified version used in cli/src/processSourceFiles.ts
// This code can be minified with: `npx terser ./cli/snippet/fileBundleIDsSnippet.js -c -m`
(() => {
  try {
    function getGlobal() {
      if (typeof window !== 'undefined') return window;
      if (typeof global !== 'undefined') return global;
      if (typeof globalThis !== 'undefined') return globalThis;
      if (typeof self !== 'undefined') return self;
      return {};
    }
    var globalObj = getGlobal();

    // Create an error just to capture the stack trace
    var stack = new globalObj.Error().stack;

    if (stack) {
      // Initialize the global map if it doesn't exist
      globalObj._EmbraceFileBundleIDs = globalObj._EmbraceFileBundleIDs || {};

      // Store a mapping of the stack trace to a placeholder (this is actually replaced in cli/src/processSourceFiles.ts)
      globalObj._EmbraceFileBundleIDs[stack] =
        '${FILE_BUNDLE_ID_CODE_SNIPPET_TEMPLATE}';
    }
  } catch (_e) {
    // Silently ignore errors
  }
})();
