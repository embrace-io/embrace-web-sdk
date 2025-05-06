// Useful for testing so that we can pass in a document-like object and change its visibilityState
export interface VisibilityStateDocument {
  visibilityState: DocumentVisibilityState;
}

// Useful for testing so that we can pass in a document-like object and change its URL
export interface URLDocument {
  URL: string;
}
