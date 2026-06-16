declare global {
  interface Window {
    EMBRACE_CURRENT_USER_SESSION_ID: string | null;
  }
}

type ReceivedSpans = Record<string, boolean>;

export type { ReceivedSpans };
