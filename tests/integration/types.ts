declare global {
  interface Window {
    EMBRACE_CURRENT_USER_SESSION_ID: string | null;
  }
}

type SessionPartInfo = {
  endReason: string;
};

type ReceivedSpans = Record<string, Record<string, SessionPartInfo>>;

export type { ReceivedSpans, SessionPartInfo };
