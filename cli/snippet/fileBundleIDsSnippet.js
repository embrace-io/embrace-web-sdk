// This is the non-minified version of the code snippet that gets injected into JS files when running the cli tool.
// This code is never executed by the sdk, but we keep it as source of truth for the minified version used in cli/src/processSourceFiles.ts
// This code can be minified with: `npx terser ./cli/snippet/fileBundleIDsSnippet.js -c -m`
((globalKey) => {
  try {
    const globalObj = globalThis;

    // Create an error just to capture the stack trace
    const stack = new globalObj.Error().stack;

    if (stack) {
      // Initialize the global map if it doesn't exist
      globalObj[globalKey] = globalObj[globalKey] || {};

      // Store a mapping of the stack trace to a placeholder (this is actually replaced in cli/src/processSourceFiles.ts)
      globalObj[globalKey][stack] =
        // biome-ignore lint/suspicious/noTemplateCurlyInString: template string is replaced during build process
        '${FILE_BUNDLE_ID_CODE_SNIPPET_TEMPLATE}';
    }
  } catch (_e) {
    // Silently ignore errors
  }
})('_EmbraceFileBundleIDs');
