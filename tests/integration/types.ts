type SessionPartInfo = {
  endReason?: string;
};

type ReceivedSpans = Record<string, Record<string, SessionPartInfo>>;

export type { ReceivedSpans, SessionPartInfo };
