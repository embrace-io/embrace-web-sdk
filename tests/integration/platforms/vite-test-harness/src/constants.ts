// Side-effect-free so integration tests can import it under Node.
export const DEFAULT_LCP_DELAY_MS = 600;
export const MAIN_THREAD_BLOCK_MS = 350;
// Long enough for the click's frame to finish rendering, so the deferred
// block lands in a long animation frame with no UI event.
export const DEFERRED_MAIN_THREAD_BLOCK_DELAY_MS = 100;
// Layout shifts within 500ms of user input are excluded from CLS, so the
// banner insertion waits out that window before shifting the content.
export const LAYOUT_SHIFT_DELAY_MS = 600;
